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
Object.defineProperty(exports, "__esModule", { value: true });
exports.zeroTimeString = void 0;
const core = __importStar(require("@actions/core"));
const api_client_typescript_1 = require("@cycleplatform/api-client-typescript");
exports.zeroTimeString = "0001-01-01T00:00:00Z";
// Function to trigger a pipeline with variables and advanced options
async function triggerPipeline(client, pipelineId, variables, advanced) {
    core.info(`🚀 Triggering pipeline: ${pipelineId}`);
    const { data, error } = await client.POST(`/v1/pipelines/{pipelineId}/trigger`, {
        params: {
            path: {
                pipelineId,
            },
        },
        body: {
            secret: core.getInput("trigger_key_secret"),
            variables,
            advanced,
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
        core.info(`✅ Pipeline triggered successfully! Run ID: ${pipelineRunId}`);
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
    let completedSteps = new Set(); // Track completed steps
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
            core.setFailed(`❌ Error fetching pipeline status: ${error.error.title} ${error.error.detail ? ` - ${error.error.detail}` : ""}`);
            return;
        }
        const { data: pipelineRun } = data;
        for (const stage of pipelineRun.stages) {
            for (const step of stage.steps) {
                const stepId = step.identifier || step.action; // Use identifier if available
                const finished = step.events.finished != exports.zeroTimeString;
                // Check if step has completed
                if (finished && !completedSteps.has(stepId)) {
                    completedSteps.add(stepId);
                    if (step.success) {
                        core.info(`✅ Step completed: ${step.action} (ident: ${step.identifier})`);
                    }
                    else {
                        core.setFailed(`❌ Step failed: ${step.action} (ident: ${step.identifier})`);
                        return;
                    }
                }
            }
        }
        if (pipelineRun.state.current === "complete") {
            core.info("🎉 Pipeline run completed successfully!");
            return;
        }
        core.info("⏳ Pipeline still running...");
        await new Promise((res) => setTimeout(res, 5000)); // Poll every 5 seconds
    }
}
async function run() {
    try {
        const pipelineId = core.getInput("pipeline_id");
        let variables = {};
        try {
            const variablesInput = core.getInput("variables");
            if (variablesInput) {
                variables = JSON.parse(variablesInput);
            }
        }
        catch (error) {
            throw new Error("❌ Invalid JSON format in 'variables' input.");
        }
        let advanced = {};
        try {
            const advancedInput = core.getInput("advanced");
            if (advancedInput) {
                advanced = JSON.parse(advancedInput);
            }
        }
        catch (error) {
            throw new Error("❌ Invalid JSON format in 'advanced' input.");
        }
        const client = (0, api_client_typescript_1.getClient)({
            // api key and hub id are actually not needed,
            // since we are using the public endpoint with a trigger key secret.
            apiKey: "",
            hubId: "",
        });
        // Step 1: Trigger the pipeline and get the run ID
        const pipelineRunId = await triggerPipeline(client, pipelineId, variables, advanced);
        // Step 2: Track the pipeline progress
        await trackPipeline(client, pipelineId, pipelineRunId);
    }
    catch (error) {
        core.setFailed(`❌ Action failed: ${error.message}`);
    }
}
run();
