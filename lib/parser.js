var Promise = require("bluebird");
var XMLParser = require("xml2js")["Parser"];
var encodeTaskDefinitionId = require('base32')["encode"];

function prefixDetect(doc) {
    for (var key in doc) {
        var n = key.indexOf(':');
        return n > 0 ? key.substr(0, n + 1) : "";
    }
}

function parseDocument(text) {
    if (!text || !(typeof text === "string" || text instanceof Buffer)) {
        return Promise.reject(new Error("Input was not a valid bpm text: "+text));
    }
    function parseTaskDefinition(taskDefinition) {
        return {
            id: encodeTaskDefinitionId(taskDefinition.$.id),
            name: taskDefinition.$.name || taskDefinition.$.id
        }
    }
    var parser = new XMLParser({
        xmlns: false,
        normalizeTags: true
    });
    return new Promise(function(resolve, reject) {
        return parser.parseString(text, function(e, document) {
            var elmProcess, prefix, start, ut, utasks;
            if (e) {
                return reject(e);
            } else {
                prefix = prefixDetect(document);
                elmProcess = document[prefix + 'definitions'][prefix + 'process'][0];
                start = elmProcess[prefix + 'startevent'][0].$;
                utasks = elmProcess[prefix + 'usertask'];
                return resolve({
                    id: elmProcess.$["id"],
                    name: elmProcess.$["name"],
                    start: {
                        id: encodeTaskDefinitionId(start.id),
                        name: start.name || start.id
                    },
                    tasks: utasks.map(parseTaskDefinition)
                });
            }
        });
    });
}

module.exports = parseDocument;