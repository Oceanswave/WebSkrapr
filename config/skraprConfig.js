var skraprConfig = {
    skrapr: null,
    correlationId: "",
    inputPath: "skraprInput.json",
    dataPath: "results_data.json",
    linksPath: "results_links.json",
    logPath: "skrapr_log.json",
    errorPath: "skrapr_errors.json"
};

if (typeof module !== "undefined")
    module.exports = skraprConfig