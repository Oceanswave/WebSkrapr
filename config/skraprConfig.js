var skraprConfig = {
    skrapr: null,
    correlationId: "",
    inputPath: "skraprInput.json",
    outputPath: "skraprOutput.json",
    errorPath: "skraprErrors.json"
};

if (typeof module !== "undefined")
    module.exports = skraprConfig