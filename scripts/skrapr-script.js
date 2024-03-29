﻿phantom.injectJs('./config/skraprConfig.js');
phantom.injectJs('./lib/jsonfn.js');
phantom.injectJs('./node_modules/async/lib/async.js');
phantom.casperPath = './node_modules/casperjs';
phantom.injectJs(phantom.casperPath + '/bin/bootstrap.js');

var fs = require('fs');
var utils = require("utils");

var skraprOutput = {
    data: [],
    links: [],
    log: []
};

var writeSkraprOutput = function() {
    var txt = JSON.stringify(skraprOutput, null, 4);
    fs.write(skraprConfig.outputPath, txt);
};

var addLogEntry = function(message, severity) {
    if (utils.isUndefined(severity))
        severity = "info";

    skraprOutput.log.push({
        date: new Date().toISOString(),
        severity: severity,
        message: message
    })
};

//load the target from file.
if (!fs.exists(skraprConfig.inputPath)) {
    addLogEntry("Unable to locate " + skraprConfig.inputPath, "Catastrophic");
    writeSkraprOutput();
    phantom.exit(1);
} else {
    var skrapr = fs.read(skraprConfig.inputPath);
    skrapr = JSONfn.parse(skrapr);
}

var clientScripts = [
        './node_modules/jquery/dist/cdn/jquery-2.1.1.min.js',
        './node_modules/underscore/underscore-min.js',
        './node_modules/URIjs/src/URI.min.js'
];

var remoteScripts = [];

if (utils.isArray(skrapr.remoteScripts)) {
    skrapr.remoteScripts.forEach(function (remoteScript) {
        remoteScripts.push(remoteScript);
    });
}

var casper = require('casper').create({
    clientScripts: clientScripts,
    remoteScripts: remoteScripts,
    pageSettings: {
        loadImages: false,
        loadPlugins: false
    },
    stepTimeout: 60000,
    logLevel: "info",
    verbose: true
});

var tryCatchDataFunc = function(getDataScript) {
    var result = {
        data: null,
        error: null
    };

    try {
        result.data = getDataScript();
    }
    catch(err) {
        result.error = err;
    }
    return result;
};

//Set the useragent if defined by the skrapr.
if (typeof (skrapr.userAgent) !== "undefined")
    casper.userAgent(skrapr.userAgent);
else
    casper.userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.102 Safari/537.36");

casper.start();

if (utils.isString(skrapr.startUrl))
    casper.thenOpen(skrapr.startUrl);
else if (utils.isArray(skrapr.startUrls))
    casper.thenOpen(skrapr.startUrls[0]);
else
    casper.log("A single startUrl or an array of startUrls must be defined on the skrapr.", "error");

if (utils.isArray(skrapr.authenticators)) {
    
    skrapr.authenticators.forEach(function (authenticator) {
        switch (authenticator.type) {
            case "forms":
                casper.then(function () {
                    this.echo("Testing authentication...");
                    if (this.evaluate(authenticator.isAuthenticated) == false) {
                        this.log("Was not authenticated, authenticating...", "info");
                        this.evaluate(authenticator.authenticate, authenticator.username, authenticator.password);
                    }
                    else {
                        this.log("Was authenticated.", "info");
                    }
                });
                
                if (typeof authenticator.waitForUrl !== "undefined")
                    casper.waitForUrl(new RegExp(authenticator.waitForUrl), function () {
                        this.log('Authentication redirected to ' + casper.getCurrentUrl(), "info");
                    });
                break;
            case "http":
                casper.setHttpAuth(authenticator.username, authenticator.password);
                break;
        }
    });
}

//Process targets.
if (utils.isArray(skrapr.targets)) {
    skrapr.targets.forEach(function (target) {
        if (utils.isObject(target.pattern) == false)
            return;

        var mimeTypeRegex = new RegExp(target.pattern.mimeType);
        var urlRegex = new RegExp(target.pattern.url);

        casper.then(function (response) {
            if (response == undefined || response.status >= 400)
            {
                this.log("Error retrieving Url: " + this.getCurrentUrl(), "error");
                return;
            }

            var currentMimeType = response.headers.get('content-type');
            var currentUrl = this.getCurrentUrl();

            if (mimeTypeRegex.test(currentMimeType) && urlRegex.test(currentUrl)) {
                if (utils.isFunction(target.script)) {
                    var result = this.evaluate(tryCatchDataFunc, target.script);

                    //It's interesting that a null error gets serialized as an empty string...
                    if (result.error == "") {
                        if (utils.isArray(result.data)) {
                            result.data.forEach(function (d) {
                                skraprOutput.data.push(d);
                            });
                        } else if (utils.isObject(result.data)) {
                            skraprOutput.data.push(result.data);
                        }
                    }
                    else {
                        addLogEntry(result.error, "error");
                    }
                }

                if (utils.isFunction(target.links)) {
                    var links = this.evaluate(tryCatchDataFunc, target.links);

                    if (links.error == "") {
                        if (utils.isArray(links.data)) {
                            links.data.forEach(function (l) {
                                skraprOutput.links.push(l);
                            });
                        } else if (utils.isObject(links)) {
                            skraprOutput.links.push(links.data);
                        }
                    } else {
                        addLogEntry(links.error, "error");
                    }

                }
            }
        });
    });
}

casper.run(function () {
    writeSkraprOutput();
    this.exit();
});