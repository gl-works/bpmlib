var assert = require("assert");
var Promise = require("bluebird");
var httpjson = require("./httpjson");
var parseDocument = require("./parser");

function BPM(bpengine, sysvars) {
    this.bpengine = bpengine;
    this.sysvars = {};
    for (var name in sysvars) {
        this.sysvars['$' + name] = sysvars[name];
    }
}

BPM.forEngine = function(engineUrl, sysvars) {
    return new BPM(engineUrl, sysvars);
};

BPM.parseDocument = require("./parser");

BPM.prototype.xmlGet = function(procdef) {
    return httpjson({
        url: this.bpengine + "/process-definition/" + procdef + "/xml",
        method: "GET"
    }).then(function(data) {
        return parseDocument(data["bpmn20Xml"]);
    })
};

BPM.prototype.deploymentGet = function(options) {
    if (options.name) {
        return httpjson({
            url: this.bpengine + "/deployment?name=" + encodeURIComponent(options.name),
            method: "GET"
        }).get(0);
    } else if (options.id) {
        return httpjson({
            url: this.bpengine + "/deployment/" + options.id,
            method: "GET"
        });
    } else {
        return Promise.reject(new Error("Neither name nor id specified"));
    }
};

BPM.prototype.deploymentQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/deployment/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.definitionQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/process-definition/" + segment,
        qs: query || {},
        method: "GET"
    });
};

function formToVariables(form) {
    var variables = {};
    var types = {  //BPMN variable types: String/Number/Boolean/Object
        'string': 'String',
        'number': 'Number',
        'boolean': 'Boolean'
    };
    for (var key in form) {
        var value = form[key],
            type = types[typeof value];
        if (type) {
            variables[key] = {
                value: value,
                type: type
            }
        }
    }
    return variables;
}

BPM.prototype.fillVariables = function(form) {
    form = form || {};
    var variables = {}, sysvars = form["sysvars"], taskvars = form["taskvars"];
    for (var name in this.sysvars) {
        if (!form[name]) {
            form[name] = this.sysvars[name];
        }
    }
    for (var name in sysvars) {
        variables['$' + name] = sysvars[name];
    }
    for (var name in taskvars) {
        variables[name] = taskvars[name];
    }
    return variables;
};

BPM.prototype.processStart = function(procdef, form) {
    return httpjson({
        url: this.bpengine + "/process-definition/" + procdef + "/start",
        body: {variables: formToVariables(this.fillVariables(form))},
        json: true,
        method: "POST"
    });
};

BPM.prototype.processQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/process-instance/" + segment,
        qs: query || {},
        method: "GET"
    });
};

function varsToQS(array, vars) {
    if (vars) {
        for (var name in vars) {
            array.push(name + "_eq_" + vars[name]);
        }
    }
}

BPM.prototype.taskQuery = function(query) {
    var segment = "", processVariables = [], taskVariables = [];
    if (typeof query === "string") {
        segment =  query;
        query = {};
    } else {
        varsToQS(processVariables, this.sysvars);
        varsToQS(processVariables, query["procvars"]);
        varsToQS(taskVariables, query["taskvars"]);
        delete query["procvars"];
        delete query["taskvars"];
        if (taskVariables.length) {
            query.taskVariables = taskVariables.join(",");
        }
        if (processVariables.length) {
            query.processVariables = processVariables.join(",");
        }
    }
    return httpjson({
        url: this.bpengine + "/task/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.taskUnassign = function(taskId) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/unclaim",
        method: "POST"
    });
};

BPM.prototype.taskAssign = function(taskId, assignee) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/claim",
        body: {userId: assignee},
        json: true,
        method: "POST"
    });
};

BPM.prototype.taskComplete = function(taskId, form) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/complete",
        body: {variables: formToVariables(this.fillVariables(form))},
        json: true,
        method: "POST"
    });
};


BPM.prototype.variablesQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/variable-instance/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.deploymentCreate = function(name, content) {
    var url = this.bpengine + "/deployment/create";
    return Promise.using(string2stream(content), function(contentStream) {
        return httpjson({
            url: url,
            formData: {
                'deployment-name': name,
                //'enable-duplicate-filtering': "true",
                //"deploy-changed-only": "true",
                '*': contentStream  //mandate stream of fs.createFileStream. BUG??
            },
            method: "POST"
        });
    });
};

BPM.prototype.deploymentDelete = function(deploymentId) {
    return httpjson({
        url: this.bpengine + "/deployment/" + deploymentId,
        method: "DELETE"
    });
};

module.exports = BPM;

function string2stream(text) {
    var tmp = require('tmp'), fs = require("fs");
    return new Promise(function(resolve, reject) {
        tmp.file({postfix: '.bpmn'}, function _tempFileCreated(err, path, fd, cleanupCallback) {
            if (err) {
                reject(err);
            } else {
                console.log("File: ", path);
                console.log("Filedescriptor: ", fd);
                fs["writeFile"](path, text, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(Promise.resolve(fs.createReadStream(path)).disposer(cleanupCallback))
                    }
                })
            }
        });
    })
}
