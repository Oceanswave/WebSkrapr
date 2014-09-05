var AWS = require('aws-sdk');
var fs = require("fs");
var async = require('async');
var path = require('path');
var skraprConfig = require("./config/skraprConfig.js");

var skrapr = {
    startUrls: [
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&color=|[B]",
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&color=|[U]",
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&color=|[W]",
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&color=|[R]",
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&color=|[G]",
        "http://gatherer.wizards.com/Pages/Search/Default.aspx?output=compact&type=+%5bLand%5d"
    ],
    targets: [
        {
            type: "web",
            pattern: {
                url: "^http://gatherer.wizards.com/Pages/Search/Default\.aspx\?.*output=compact.*",
                mimeType: "text/html.*"
            },
            script: "function() { \
var result = []; \
jQuery('div.cardList > table.compact > tbody > tr.cardItem') \
    .each(function (i, value) { \
    \
    var cardInfo = { \
        name: '', \
        url: '', \
    }; \
    \
    var nameAnchor = jQuery(value).find('td.name > a').first(); \
    cardInfo.name = nameAnchor.text(); \
    cardInfo.url = URI(nameAnchor.attr('href')).absoluteTo(window.location.href).toString(); \
    \
    result.push(cardInfo); \
}); \
return result; \
}",
links: "function() { \
var currentPage = jQuery('div.contentcontainer > div.smallGreyBorder > div.paging.bottom > div.pagingcontrols > a').first().attr('href'); \
var currentPageNumber = URI(currentPage).search(true)['page']; \
var maxPages = jQuery('div.contentcontainer > div.smallGreyBorder > div.paging.bottom > div.pagingcontrols > a').last().attr('href'); \
var maxPageNumber =  URI(maxPages).search(true)['page']; \
var result = []; \
if (currentPageNumber == 0) { \
    for (var i = 1; i <= maxPageNumber; i++) \
        result.push(URI(currentPage).search(function(data) { data['page'] = i; }).absoluteTo(window.location.href).toString()); \
} \
return result; \
}"
        }
    ]
};

//var skrapr = {
//    startUrl: "https://www.kleverig.eu/",
//    targets: [
//        {
//            type: "web",
//            pattern: {
//                url: "^http(s)?://www.kleverig.eu/$",
//                mimeType: "text/html"
//            },
//            properties: {
//            "forums": {

//                }
//            },
//        }
//    ],
//    authenticators: [
//        {
//            type: "forms",
//            username: "Sleepyhead",
//            password: "ode2bach",
//            isAuthenticated: "function() {\
//                return !!!jQuery('#navbar_loginform').length; \
//            }",
//            authenticate: "function(username, password) {\
//                jQuery('#navbar_username').val(username); \
//                jQuery('#navbar_password').val(password); \
//                jQuery('#navbar_loginform').submit(); \
//            }",
//            waitForUrl: "^https://www.kleverig.eu/$"
//        }
//    ],
//};

//var skrapr = {
//    startUrl: "https://www.google.com/",
//    userAgent: "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.102 Safari/537.36",
//};


var cleanupSkraprFiles = function () {
    //Remove files.
    if (fs.existsSync(skraprConfig.dataPath))
        fs.unlinkSync(skraprConfig.dataPath);
    
    if (fs.existsSync(skraprConfig.linksPath))
        fs.unlinkSync(skraprConfig.linksPath);
    
    if (fs.existsSync(skraprConfig.logPath))
        fs.unlinkSync(skraprConfig.logPath);

    if (fs.existsSync(skraprConfig.errorPath))
        fs.unlinkSync(skraprConfig.errorPath);
};

AWS.config.region = 'us-east-1';

var invokePhantomJS = function (callback) {
    var childProcess = require('child_process');
    var phantomjs = require('phantomjs');

    var binPath = phantomjs.path;
    
    var childArgs = [
        "--load-images=false",
        "--ignore-ssl-errors=true",
        "--ssl-protocol=any",
        "--web-security=false",
        "--disk-cache=true",
        "--max-disk-cache-size=10000",
        path.join(__dirname, '/scripts/skrapr-script.js')
    ];
    
    console.log("starting phantomjs...");
    cleanupSkraprFiles();

    childProcess.execFile(binPath, childArgs, function (err, stdout, stderr) {
        if (err) {
            if (fs.existsSync(skraprConfig.errorPath)) {
                var error = fs.readFileSync(skraprConfig.errorPath, "utf8");
                console.log(stdout);
                console.log(stderr);
                console.log(error);
                console.log(err);
            } else {
                console.log(stdout);
                console.log(stderr); // an error occurred
                console.log(err); // an error occurred
            }
        } else {
            console.log("Completed successfully:");
            console.log(stdout); // successful response
        }
        callback();
    });
};

var die = false;

//Add a log entry that indicates this worker is ready...
async.whilst(
    function () {
        return !die;
    },
    function (callback) {
        //Monitor configured AWS SQS queue for a new target url. The queued item should contain the account/project/skrapr
    
        //Get skrapr definition from couchdb.

        //save the skrapr to target.json
        var skraprJson = JSON.stringify(skrapr, null, 4);
        fs.writeFileSync(skraprConfig.inputPath, skraprJson);

        //Invoke phantomjs. 
        invokePhantomJS(function() {
            console.log("Waiting...");
            setTimeout(callback, 5000);
        });
    },
    function (err) {
        //Shutdown.
        cleanupSkraprFiles();
    }
);