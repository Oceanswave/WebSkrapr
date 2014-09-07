/*
WebSkrapr:

Ensure the following environment variables are set:
 Skrapr_CouchDB_Host: The address of the CouchDB to use.
 Skrapr_CouchDB_Port: Port Number of CouchDB (E.g. 443 for SSL)
 Skrapr_CouchDB_Key: The Username/Key of the account to use when connecting to couch
 Skrapr_CouchDB_Password: The password of the account to use when connecting to couch
 Skrapr_CouchDB_Database: Soon to be deprecated.

 In WebStorm 8, these can be set in Run->Edit Configurations->Environment Variables
 */

var AWS = require('aws-sdk');
var fs = require("fs");
var async = require('async');
var cradle = require('cradle');
var path = require('path');
var skraprConfig = require("./config/skraprConfig.js");
var JSONfn = require("./lib/JSONfn").JSONfn;


var _skrapr = {
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
            script: function() {
                var result = [];
                jQuery('div.cardList > table.compact > tbody > tr.cardItem')
                    .each(function (i, value) {

                        var cardInfo = {
                            _id: null,
                            name: '',
                            url: ''
                        };

                        var nameAnchor = jQuery(value).find('td.name > a').first();
                        var uri = URI(nameAnchor.attr('href'));
                        cardInfo._id = uri.search(true)['multiverseid'];
                        cardInfo.name = nameAnchor.text();
                        cardInfo.url = uri.absoluteTo(window.location.href).toString();

                        result.push(cardInfo);
                    });
                return result;
            },
            links: function() {
                var currentPage = jQuery('div.contentcontainer > div.smallGreyBorder > div.paging.bottom > div.pagingcontrols > a').first().attr('href');
                var currentPageNumber = URI(currentPage).search(true)['page'];
                var maxPages = jQuery('div.contentcontainer > div.smallGreyBorder > div.paging.bottom > div.pagingcontrols > a').last().attr('href');
                var maxPageNumber = URI(maxPages).search(true)['page'];
                var result = [];
                if (currentPageNumber == 0) {
                    for (var i = 1; i <= maxPageNumber; i++) {
                        result.push(URI(currentPage).search(function (data) {
                            data['page'] = i;
                        }).absoluteTo(window.location.href).toString());
                    }
                }
                return result;
            }
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
//            username: "xxxxxxxxxxxx",
//            password: "xxxxxxxxxxxx",
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
    if (fs.existsSync(skraprConfig.outputPath))
        fs.unlinkSync(skraprConfig.outputPath);
};

var setupCouchDb = function() {
    console.log("Setting up CouchDB...");
    cradle.setup({
        host: process.env["Skrapr_CouchDB_Host"],
        port: process.env["Skrapr_CouchDB_Port"],
        auth: {
            username: process.env["Skrapr_CouchDB_Key"],
            password: process.env["Skrapr_CouchDB_Password"]
        },
        cache: true,
        raw: false,
        forceSave: true
    });
};

var initializeDb = function(projectId, callback) {
    console.log("Initializing db for project: " + projectId);

    async.waterfall([
        function(callback) {
            //TODO: Instead of getting this from the env, create/new up a db from the Skrapr Project.
            var db = new(cradle.Connection)().database(process.env["Skrapr_CouchDB_Database"]);

            db.exists(function (err, exists) {
                if (err) {
                    console.log('error', err);
                } else if (exists) {
                    console.log('Project Database exists.');

                    /*db.all(function (err, res) {
                     res.forEach(function (value) {
                     db.remove(this.id, value.rev, function (err, res) {
                     //Handle response
                     });
                     console.log("%s is on the %s side of the force.", this.id, this.key);
                     });
                     });*/

                    callback(null, db);
                } else {
                    console.log('Project Database does not exist.');
                    db.create();
                    /* populate design documents */
                }
            });
        }
    ], function(err, db) {
        if (err) throw err;

        if (typeof callback === "function")
            callback(db); //
    });
};

var invokePhantomJS = function (callback) {
    var childProcess = require('child_process');
    var phantomJS = require('phantomjs');

    var binPath = phantomJS.path;

    var childArgs = [
        "--load-images=false",
        "--ignore-ssl-errors=true",
        "--ssl-protocol=any",
        "--web-security=false",
        "--disk-cache=true",
        "--max-disk-cache-size=10000",
        path.join(__dirname, '/scripts/skrapr-script.js')
    ];

    cleanupSkraprFiles();
    console.log("Starting PhantomJS...");

    childProcess.execFile(binPath, childArgs, function (err, stdout, stderr) {
        if (err) {
            if (fs.existsSync(skraprConfig.outputPath)) {
                var output = fs.readFileSync(skraprConfig.outputPath, "utf8");
                output = JSON.parse(output);
                console.log(stdout);
                console.log(stderr);
                console.log(output.log);
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

var saveResults = function(project, callback) {
    console.log("Saving results...");

    async.waterfall([
        //load the output file
        function(callback) {
            fs.readFile(skraprConfig.outputPath, function(err, outputJson){
                if (err) throw err;
                var results = JSON.parse(outputJson);
                callback(null, results);
            });
        },
        //Initialize the DB based on the project.
        function (results, callback) {
            initializeDb("tototo", function(db) {
                callback(null, db, results);
            });
        },
        function(db, results, callback) {
            if (db == null) {
                throw "DB was null.";
            }

            if (results == null) {
                throw "Results were null.";
            }

            db.save(results.data, function (err, res) {
                // Handle response
                if (err != null) {
                    console.log(err);
                    //TODO: Log err to log...
                }
                else {
                    console.log("Saved " + res.length + " results.");
                    callback();
                }
            });
        }
    ], callback);
};

/* Main Entry Point */
var die = false;

setupCouchDb();

//Add a log entry that indicates this worker is ready...
async.whilst(
    function () {
        return !die;
    },
    function (loop) {
        async.waterfall([
            //Monitor configured AWS SQS queue for a new target url. The queued item should contain the account/project/skrapr
            function(callback) {
                //TODO: Finish this.

                callback();
            },
            //Get skrapr project definition from CouchDB.
            function(callback) {
                //TODO: Finish this.
                var project = {
                    name: "test12345"
                };

                var skrapr = _skrapr;

                callback(null, project, skrapr);
            },
            //save skrapr to target.json
            function(project, skrapr, callback) {
                if (skrapr == null) {
                    console.log("Skrapr was null!");
                    return;
                }

                var skraprJson = JSONfn.stringify(skrapr, null, 4);

                fs.writeFile(skraprConfig.inputPath, skraprJson, null, function(err) {
                    if (err) throw err;
                    callback(null, project, skrapr)
                });
            },
            //Invoke PhantomJS.
            function(project, skrapr, callback) {
                invokePhantomJS(function() {
                    callback(null, project, skrapr);
                })
            },
            //Push Logs/Data to CouchDB.
            function(project, skrapr, callback) {
                saveResults(project, function() {
                    callback();
                });
            }
        ], function() {
            //Loop...
            console.log("Waiting...");
            setTimeout(loop, 5000);
        });
    },
    function (err) {
        //Shutdown.
        cleanupSkraprFiles();

        console.log(err);
        console.log("All Done!")
    }
);