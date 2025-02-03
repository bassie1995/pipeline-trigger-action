# Cycle Pipeline Github Action

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cycle.io/global/resources/images/logos/cycle-logo-white.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://static.cycle.io/icons/logo/cycle-logo-fullcolor.svg">
  <img alt="cycle" src="https://static.cycle.io/icons/logo/cycle-logo-fullcolor.svg">
</picture>

### **Trigger a pipeline on Cycle using a GitHub Action**
This GitHub Action allows you to [**trigger a pipeline on Cycle.io**](https://cycle.io/docs/platform/introduction-to-pipelines), pass variables, and track the execution **step-by-step** with detailed logging.

---

## 📖 **How It Works**
✅ Triggers a Cycle pipeline using the provided **Pipeline ID**  
✅ Passes optional **variables** and **advanced settings**  
✅ **Tracks each step** as it progresses  
✅ Logs when **each step starts and completes**  
✅ **Fails fast** if a step fails  

---

## 📌 **Usage**
### **1️⃣ Add this Action to Your Workflow**
Create (or update) your GitHub Actions workflow file (e.g., `.github/workflows/cycle-pipeline.yml`):

```yaml
name: Run Cycle Pipeline

on:
  workflow_dispatch: # Allows manual triggering from the GitHub UI

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3

      - name: Track Cycle Pipeline
        uses: cycleplatform/pipeline-trigger-action@v0.5.8
        with:
          api_key: ${{ secrets.CYCLE_API_KEY }}
          hub_id: ${{ secrets.CYCLE_HUB_ID }}
          pipeline_id: "your-pipeline-id"
          secret: ${{ secrets.PIPELINE_SECRET }}
          variables: |
            {
              "version": "1.2.3",
              "feature_flag": "true"
            }
          advanced: |
            {
              "sub_queue": "custom-queue",
              "skip_locks": 1
            }

```


---

## ⚙️ **Inputs**
| Name           | Required | Description |
|----------------|----------|-------------|
| `api_key`      | ✅ Yes   | Your Cycle API Key |
| `hub_id`       | ✅ Yes   | Your Cycle Hub ID |
| `pipeline_id`  | ✅ Yes   | The Cycle Pipeline ID to trigger |
| `secret`       | ✅ Yes   | A required secret for executing the pipeline |
| `variables`    | ❌ No    | JSON string of key-value pairs for pipeline variables (optional) |
| `advanced`     | ❌ No    | JSON string for advanced pipeline settings (optional) |

---

## 📜 **Example Output in GitHub Actions Logs**
When the action runs, you’ll see detailed logs:

```
🚀 Triggering pipeline: 'Deploy to Staging'
✅ Pipeline triggered successfully! Run ID: 67927ee3fb6a5cc6e0a5a177
⏳ Step started [Stage 1, Step 1]: stack.build.create
✅ Step completed [Stage 1, Step 1]: stack.build.create
⏳ Step started [Stage 1, Step 2]: image.create-import
✅ Step completed [Stage 1, Step 2]: image.create-import
🎉 Pipeline run completed successfully!
```

✅ **Logs each step's start and completion**  
✅ **Identifies the stage and step index**  
✅ **Fails early if a step fails**

---

## ❓ **Troubleshooting**
### 🔴 **Pipeline doesn't start**
- Ensure **`pipeline_id`** is correct.
- Verify **API key and secret** are valid.

### 🔴 **Steps are not logged correctly**
- Ensure **variables and advanced options** are correctly formatted as **JSON strings**.

---

## 📄 **License**
This GitHub Action is **open-source** under the [Apache 2.0 License](LICENSE)