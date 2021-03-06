var assert = require("assert");
var Promise = require("bluebird");
var _ = require("lodash");
var httpjson = require("./httpjson");
var parseDocument = require("./parser");

function BPM(bpengine, sysvars, options) {
    options = options || {};
    this.bpengine = bpengine;
    this.sysvars = {};
    this.useDefkey = options.useDefkey !== false;  //use key(bpmn-definition-key) instead of id when applicable
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
        url: this.bpengine + "/process-definition/" + (this.useDefkey ? "key/":"") + procdef + "/xml",
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
        segment =  this.useDefkey ? ("key/" + query) : query;
        query = {};
    }
    var queried = httpjson({
        url: this.bpengine + "/process-definition/" + segment,
        qs: query || {},
        method: "GET"
    });
    if (this.useDefkey) {
        queried = queried.then(function(definitions) {
            return definitions.map(function(definition) {
                definition["id"] = definition["key"];
                delete definition["key"];
                return definition;
            })
        })
    }
    return queried;
};

function formToVariables(form) {
    // possible variable type: String, Boolean, Integer, Long?, Double?, Date?
    var variables = {};
    for (var key in form) {
        var value = form[key], type;
        switch (typeof value) {
            case 'string':
                type = 'String';
                break;
            case 'number':
                if (_.isFinite(value)) {
                    if (Math.floor(value) === value) {
                        type = 'Long';
                    } else {
                        type = 'Double';
                    }
                }
                break;
            case 'boolean':
                type = 'Boolean';
                break;
            case 'object':
                type = 'json';
                value = JSON.stringify(value);
        }
        if (type) {
            variables[key] = {
                value: value,
                type: type
            };
        }
    }
    return variables;
}

BPM.prototype.fillVariables = function(form) {
    form = form || {};
    var variables = {}, procvars = form["procvars"], taskvars = form["taskvars"], uservars = form["uservars"];
    for (var name in uservars) {
        variables[name] = uservars[name];
    }
    for (var name in this.sysvars) {
        variables[name] = this.sysvars[name];
    }
    for (var name in procvars) {
        variables['$' + name] = procvars[name];
    }
    for (var name in taskvars) {
        variables["$" + name] = taskvars[name];
    }
    return variables;
};

BPM.prototype.processStart = function(procdef, form) {
    return httpjson({
        url: this.bpengine + "/process-definition/" + (this.useDefkey ? "key/" : "") + procdef + "/start",
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

function varsToQS(array, vars, prefix) {
    prefix = prefix || "";
    if (vars) {
        for (var name in vars) {
            array.push(prefix + name + "_eq_" + vars[name]);
        }
    }
}

BPM.prototype.processCount = function(query) {
    var processVariables = [], historic;
    historic = query['historic'];
    delete query['historic'];
    varsToQS(processVariables, this.sysvars);
    varsToQS(processVariables, query["procvars"], "$");
    delete query["procvars"];
    if (processVariables.length) {
        query.variables = processVariables.join(",");
    }
    //http://docs.camunda.org/latest/api-references/rest/#history-get-task-historic
    //  in camunda 7.3 query by assignee differs from older version in that
    //  it use 'taskAssignee' rather than 'assignee'
    return httpjson({
        url: this.bpengine + (historic ? "/history/process-instance/count/" : "/process-instance/count/"),
        qs: query,
        method: "GET"
    });
};


BPM.prototype.taskQuery = function(query) {
    var segment = "", processVariables = [], taskVariables = [], historic;
    if (typeof query === "string") {
        segment =  query;
        query = {};
    } else {
        historic = query['historic'];
        delete query['historic'];
        varsToQS(processVariables, this.sysvars);
        varsToQS(processVariables, query["procvars"], "$");
        varsToQS(taskVariables, query["taskvars"]);
        delete query["procvars"];
        delete query["taskvars"];
        if (taskVariables.length) {
            query.taskVariables = taskVariables.join(",");
        }
        if (processVariables.length) {
            query.processVariables = processVariables.join(",");
        }
        //http://docs.camunda.org/latest/api-references/rest/#history-get-task-historic
        //  in camunda 7.3 query by assignee differs from older version in that
        //  it use 'taskAssignee' rather than 'assignee'
        if (historic) {
            if ((query.taskAssignee = query.assignee) !== undefined) {
                delete query.assignee;
            }
        }
    }
    return httpjson({
        url: this.bpengine + (historic ? "/history/task/" : "/task/") + segment,
        qs: query || {},
        method: "GET"
    }).map(historic ? normalizeHistoryTask : normalizeTask);
};

function normalizeTask(record) {
    return _.pick(record, "id", "name", "assignee", "created", "due", "followUp",
        "delegationState", "description", "executionId", "owner",
        "parentTaskId", "processDefinitionId", "processInstanceId", "taskDefinitionKey");
}

function normalizeHistoryTask(record) {
    record = _.pick(record, "id", "processDefinitionId", "processInstanceId", "executionId",
        "name", "description", "deleteReason", "owner", "assignee",
        "startTime", "endTime", "duration", "taskDefinitionKey",
        "due", "parentTaskId", "followUp");
    record.historic = true;
    return record;
}

BPM.prototype.taskUnassign = function(taskId) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/unclaim",
        method: "POST"
    });
};

BPM.prototype.taskAssign = function(taskId, assignee) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/assignee",
        body: {userId: assignee},
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
    } else {
        var q = _.omit(query, "processInstance"), procInst;
        if (procInst = query["processInstance"]) {
            q.processInstanceIdIn = procInst;
        }
        query = q;
    }
    if (!query.hasOwnProperty("deserializeValues")) {
        query.deserializeValues = false;
    }
    return httpjson({
        url: this.bpengine + "/variable-instance/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.deploymentCreate = function(name, content) {
    var url = this.bpengine + "/deployment/create";
    return Promise.using(string2stream(content), function(contentStream) { //TODO validate all process/tasks are IDentified
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

BPM.prototype.processDelete = function(processId) {
    return httpjson({
        url: this.bpengine + "/process-instance/" + processId,
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
