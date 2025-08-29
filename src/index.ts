import * as core from "@actions/core";
import {
  components,
  getClient,
  trackJob,
} from "@cycleplatform/api-client-typescript";

import pipelineVariables from "../variables.json"

type AdvancedOptions = {
  sub_queue?: string | null;
  skip_locks?: number | null;
};

export const zeroTimeString = "0001-01-01T00:00:00Z";

// Function to trigger a pipeline with variables and advanced options
async function triggerPipeline(
  client: ReturnType<typeof getClient>,
  pipelineId: string,
  variables: Record<string, string>,
  advanced: AdvancedOptions
): Promise<string> {
  const { data: getPipelineData, error: getPipelineError } = await client.GET(
    "/v1/pipelines/{pipelineId}",
    {
      params: {
        path: {
          pipelineId,
        },
      },
    }
  );

  if (getPipelineError) {
    throw new Error(
      `❌ Failed to fetch pipeline: ${getPipelineError.error.title} ${
        getPipelineError.error.detail
          ? ` - ${getPipelineError.error.detail}`
          : ""
      }`
    );
  }

  console.log(`🚀 Triggering pipeline: '${getPipelineData.data.name}'`);

  const { data, error } = await client.POST(
    `/v1/pipelines/{pipelineId}/tasks`,
    {
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
    }
  );

  if (error) {
    throw new Error(
      `❌ Failed to trigger pipeline: ${error.error.title} ${
        error.error.detail ? ` - ${error.error.detail}` : ""
      }`
    );
  }

  const { data: jd } = data;

  try {
    const job = await trackJob(client, jd.job?.id || "").promise;
    const pipelineRunId = job.tasks[0]?.output?.run_id;

    if (!pipelineRunId) {
      throw new Error(`❌ Failed to trigger pipeline: job is missing run ID`);
    }

    console.log(`✅ Pipeline triggered successfully! Run ID: ${pipelineRunId}`);
    return pipelineRunId;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "id" in e) {
      const j = e as components["schemas"]["Job"];
      throw new Error(
        `❌ Failed to trigger pipeline: job failed - ${j.state.error?.message}`
      );
    } else {
      throw new Error(
        `❌ Failed to trigger pipeline: ${JSON.stringify(e, null, 2)}`
      );
    }
  }
}

// Polling function to track pipeline execution
async function trackPipeline(
  client: ReturnType<typeof getClient>,
  pipelineId: string,
  runId: string
) {
  const completedSteps = new Set<string>(); // Track completed steps
  let startedSteps = new Set<string>(); // Track started steps

  while (true) {
    const { data, error } = await client.GET(
      `/v1/pipelines/{pipelineId}/runs/{runId}`,
      {
        params: {
          path: {
            pipelineId,
            runId,
          },
        },
      }
    );

    if (error) {
      throw new Error(
        `❌ Error fetching pipeline status: ${error.error.title} ${
          error.error.detail ? ` - ${error.error.detail}` : ""
        }`
      );
    }

    const { data: pipelineRun } = data;

    pipelineRun.stages.forEach((stage, stageIdx) => {
      stage.steps.forEach((step, stepIdx) => {
        const stepId = `${stageIdx}-${stepIdx}`;
        const finished = step.events.finished !== zeroTimeString;

        // Determine if the previous step is completed
        const prevStep = stepIdx > 0 ? stage.steps[stepIdx - 1] : null;
        const prevStepFinished = prevStep
          ? prevStep.events.finished !== zeroTimeString
          : true; 

        const groupName = `[Stage ${stageIdx + 1}, Step ${stepIdx + 1}]: ${step.action}`

        if (prevStepFinished && !startedSteps.has(stepId)) {
          startedSteps.add(stepId);
          console.log(
            `⏳ Step started ${groupName}`
          );
        }

        if (finished && !completedSteps.has(stepId)) {
          completedSteps.add(stepId);
          if (step.success) {
            console.log(
              `✅ Step completed ${groupName}\n`
            );
          } else {
            throw new Error(
              `❌ Step failed ${groupName} - ${step.error?.message}\n`
            );
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

    let variables: Record<string, string> = {};
    try {
      const variablesInput = core.getInput("VARIABLES");
      if (variablesInput) {
        variables = JSON.parse(variablesInput);
      }
    } catch (error) {
      throw new Error("❌ Invalid JSON format in 'variables' input.");
    }

    let advanced: AdvancedOptions = {};
    try {
      const advancedInput = pipelineVariables.advanced; // core.getInput("advanced");
      if (advancedInput) {
        advanced = JSON.parse(JSON.stringify(advancedInput));
      }
    } catch (error) {
      throw new Error("❌ Invalid JSON format in 'advanced' input.");
    }

    const client = getClient({
      apiKey,
      hubId,
      baseUrl: core.getInput("base_url") || undefined,
    });

    // Step 1: Trigger the pipeline and get the run ID
    const pipelineRunId = await triggerPipeline(
      client,
      pipelineId,
      variables,
      advanced
    );

    // Step 2: Track the pipeline progress
    await trackPipeline(client, pipelineId, pipelineRunId);
  } catch (error) {
    throw new Error(`❌ Action failed: ${(error as Error).message}`);
  }
}

run();
