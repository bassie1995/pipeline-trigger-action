"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zeroTimeString = void 0;
const core = __importStar(require("@actions/core"));
const api_client_typescript_1 = require("@cycleplatform/api-client-typescript");
const variables_json_1 = __importDefault(require("../variables.json"));
exports.zeroTimeString = "0001-01-01T00:00:00Z";
// Function to trigger a pipeline with variables and advanced options
async function triggerPipeline(client, pipelineId, variables, advanced) {
    const { data: getPipelineData, error: getPipelineError } = await client.GET("/v1/pipelines/{pipelineId}", {
        params: {
            path: {
                pipelineId,
            },
        },
    });
    if (getPipelineError) {
        throw new Error(`❌ Failed to fetch pipeline: ${getPipelineError.error.title} ${getPipelineError.error.detail
            ? ` - ${getPipelineError.error.detail}`
            : ""}`);
    }
    console.log(`🚀 Triggering pipeline: '${getPipelineData.data.name}'`);
    const { data, error } = await client.POST(`/v1/pipelines/{pipelineId}/tasks`, {
        params: {
            path: {
                pipelineId,
            },
        },
        body: {
            action: "trigger",
            contents: {
                variables,
                advanced,
            },
        },
    });
    if (error) {
        throw new Error(`❌ Failed to trigger pipeline: ${error.error.title} ${error.error.detail ? ` - ${error.error.detail}` : ""}`);
    }
    const { data: jd } = data;
    try {
        const job = await (0, api_client_typescript_1.trackJob)(client, jd.job?.id || "").promise;
        const pipelineRunId = job.tasks[0]?.output?.run_id;
        if (!pipelineRunId) {
            throw new Error(`❌ Failed to trigger pipeline: job is missing run ID`);
        }
        console.log(`✅ Pipeline triggered successfully! Run ID: ${pipelineRunId}`);
        return pipelineRunId;
    }
    catch (e) {
        if (e && typeof e === "object" && "id" in e) {
            const j = e;
            throw new Error(`❌ Failed to trigger pipeline: job failed - ${j.state.error?.message}`);
        }
        else {
            throw new Error(`❌ Failed to trigger pipeline: ${JSON.stringify(e, null, 2)}`);
        }
    }
}
// Polling function to track pipeline execution
async function trackPipeline(client, pipelineId, runId) {
    const completedSteps = new Set(); // Track completed steps
    let startedSteps = new Set(); // Track started steps
    while (true) {
        const { data, error } = await client.GET(`/v1/pipelines/{pipelineId}/runs/{runId}`, {
            params: {
                path: {
                    pipelineId,
                    runId,
                },
            },
        });
        if (error) {
            throw new Error(`❌ Error fetching pipeline status: ${error.error.title} ${error.error.detail ? ` - ${error.error.detail}` : ""}`);
        }
        const { data: pipelineRun } = data;
        pipelineRun.stages.forEach((stage, stageIdx) => {
            stage.steps.forEach((step, stepIdx) => {
                const stepId = `${stageIdx}-${stepIdx}`;
                const finished = step.events.finished !== exports.zeroTimeString;
                // Determine if the previous step is completed
                const prevStep = stepIdx > 0 ? stage.steps[stepIdx - 1] : null;
                const prevStepFinished = prevStep
                    ? prevStep.events.finished !== exports.zeroTimeString
                    : true;
                const groupName = `[Stage ${stageIdx + 1}, Step ${stepIdx + 1}]: ${step.action}`;
                if (prevStepFinished && !startedSteps.has(stepId)) {
                    startedSteps.add(stepId);
                    console.log(`⏳ Step started ${groupName}`);
                }
                if (finished && !completedSteps.has(stepId)) {
                    completedSteps.add(stepId);
                    if (step.success) {
                        console.log(`✅ Step completed ${groupName}\n`);
                    }
                    else {
                        throw new Error(`❌ Step failed ${groupName} - ${step.error?.message}\n`);
                    }
                }
            });
        });
        if (pipelineRun.state.current === "complete") {
            console.log("🎉 Pipeline run completed successfully!");
            return;
        }
        await new Promise((res) => setTimeout(res, 3000));
    }
}
async function run() {
    try {
        const pipelineId = core.getInput("PIPELINE_ID");
        const apiKey = core.getInput("API_KEY");
        const hubId = core.getInput("HUB_ID");
        let variables = {};
        try {
            const variablesInput = core.getInput("VARIABLES");
            if (variablesInput) {
                variables = JSON.parse(variablesInput);
            }
        }
        catch (error) {
            throw new Error("❌ Invalid JSON format in 'variables' input.");
        }
        let advanced = {};
        try {
            const advancedInput = variables_json_1.default.advanced; // core.getInput("advanced");
            if (advancedInput) {
                advanced = JSON.parse(JSON.stringify(advancedInput));
            }
        }
        catch (error) {
            throw new Error("❌ Invalid JSON format in 'advanced' input.");
        }
        const client = (0, api_client_typescript_1.getClient)({
            apiKey,
            hubId,
            baseUrl: core.getInput("base_url") || undefined,
        });
        // Step 1: Trigger the pipeline and get the run ID
        const pipelineRunId = await triggerPipeline(client, pipelineId, variables, advanced);
        // Step 2: Track the pipeline progress
        await trackPipeline(client, pipelineId, pipelineRunId);
    }
    catch (error) {
        throw new Error(`❌ Action failed: ${error.message}`);
    }
}
run();
