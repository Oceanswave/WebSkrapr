phantom.injectJs('./config/skraprConfig.js');
phantom.casperPath = './node_modules/casperjs';
phantom.injectJs(phantom.casperPath + '/bin/bootstrap.js');

var fs = require('fs');
var utils = require("utils");


//load the target from file.
if (!fs.exists(skraprConfig.inputPath)) {
    fs.write("skrapr_errors.json", "Unable to locate " + skraprConfig.inputPath, 'w');
    phantom.exit(1);
} else {
    var skrapr = fs.read(skraprConfig.inputPath);
    skrapr = JSON.parse(skrapr);
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

//Write out data and links when casper finishes...
var results = {
    data: [],
    links: []
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
            var currentMimeType = response.headers.get('content-type');
            var currentUrl = this.getCurrentUrl();

            if (mimeTypeRegex.test(currentMimeType) && urlRegex.test(currentUrl)) {
                if (utils.isString(target.script)) {
                    var data = this.evaluate(target.script);
                    if (utils.isArray(data)) {
                        data.forEach(function (d) {
                            results.data.push(d);
                        });
                    } else if (utils.isObject(data)) {
                        results.data.push(data);
                    }
                        
                }

                if (utils.isString(target.links)) {
                    var links = this.evaluate(target.links);
                    if (utils.isArray(links)) {
                        links.forEach(function (l) {
                            results.links.push(l);
                        });
                    } else if (utils.isObject(links)) {
                        results.links.push(links);
                    }
                }
            }
        });
    });
}

casper.run(function () {
    fs.write(skraprConfig.dataPath, JSON.stringify(results.data, null, 4));
    fs.write(skraprConfig.linksPath, JSON.stringify(results.links, null, 4));
    this.exit();
});