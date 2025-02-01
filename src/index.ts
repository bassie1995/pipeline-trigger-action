import * as core from "@actions/core";
import {
  components,
  getClient,
  trackJob,
} from "@cycleplatform/api-client-typescript";

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

  core.info(`🚀 Triggering pipeline: '${getPipelineData.data.name}'`);

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
          // advanced,
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

    core.info(`✅ Pipeline triggered successfully! Run ID: ${pipelineRunId}`);
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
  let completedSteps = new Set<string>(); // Track completed steps

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
      core.setFailed(
        `❌ Error fetching pipeline status: ${error.error.title} ${
          error.error.detail ? ` - ${error.error.detail}` : ""
        }`
      );
      return;
    }

    const { data: pipelineRun } = data;

    for (const stage of pipelineRun.stages) {
      for (const step of stage.steps) {
        const stepId = step.identifier || step.action; // Use identifier if available

        const finished = step.events.finished != zeroTimeString;

        // Check if step has completed
        if (finished && !completedSteps.has(stepId)) {
          completedSteps.add(stepId);
          if (step.success) {
            core.info(`✅ Step completed: ${step.action}`);
          } else {
            core.setFailed(
              `❌ Step failed: ${step.action} - ${step.error?.message}`
            );
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
    const apiKey = core.getInput("api_key");
    const hubId = core.getInput("hub_id");

    let variables: Record<string, string> = {};
    try {
      const variablesInput = core.getInput("variables");
      if (variablesInput) {
        variables = JSON.parse(variablesInput);
      }
    } catch (error) {
      throw new Error("❌ Invalid JSON format in 'variables' input.");
    }

    let advanced: AdvancedOptions = {};
    try {
      const advancedInput = core.getInput("advanced");
      if (advancedInput) {
        advanced = JSON.parse(advancedInput);
      }
    } catch (error) {
      throw new Error("❌ Invalid JSON format in 'advanced' input.");
    }

    const client = getClient({
      // api key and hub id are actually not needed,
      // since we are using the public endpoint with a trigger key secret.
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
    core.setFailed(`❌ Action failed: ${(error as Error).message}`);
  }
}

run();
