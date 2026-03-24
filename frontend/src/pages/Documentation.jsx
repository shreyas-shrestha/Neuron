import { Link } from "react-router-dom";

function CodeBlock({ children, title }) {
  return (
    <div className="rounded-lg border border-neuron-border bg-neuron-muted/25 overflow-hidden">
      {title ? <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wide text-neuron-mutedText border-b border-neuron-border">{title}</div> : null}
      <pre className="p-4 text-[12px] font-mono text-neuron-primary overflow-x-auto leading-relaxed whitespace-pre-wrap">{children}</pre>
    </div>
  );
}

export default function Documentation() {
  return (
    <div className="max-w-3xl space-y-10 pb-16">
      <div>
        <p className="text-[13px] text-neuron-mutedText font-sans tracking-wide">Documentation</p>
        <h1 className="font-display font-semibold text-[22px] text-neuron-primary mt-1">SDK setup &amp; usage</h1>
        <p className="text-[14px] text-neuron-secondary mt-3 font-sans leading-relaxed">
          Use the Python SDK to report checkpoints from your training loop so Neuron can track behavior change (BCI) across
          epochs and compare against a baseline.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">1. Prerequisites</h2>
        <ul className="list-disc pl-5 text-[14px] text-neuron-secondary font-sans space-y-2 leading-relaxed">
          <li>
            <strong className="text-neuron-primary font-medium">Neuron API</strong> running (default{" "}
            <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">http://127.0.0.1:8000</code>
            ). The SDK talks to the API directly, not through the Vite dev server.
          </li>
          <li>
            <strong className="text-neuron-primary font-medium">Python 3.9+</strong> with PyTorch installed in the same
            environment you train in.
          </li>
          <li>
            A <strong className="text-neuron-primary font-medium">registered model</strong> in the app (same{" "}
            <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">model_id</code> you pass to{" "}
            <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">init</code>) — register via{" "}
            <Link to="/onboarding" className="text-neuron-accent font-medium hover:underline">
              Add model
            </Link>{" "}
            or the Models flow so the backend knows your Hugging Face id / checkpoint.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">2. Get an API key</h2>
        <ol className="list-decimal pl-5 text-[14px] text-neuron-secondary font-sans space-y-2 leading-relaxed">
          <li>
            Sign in to the web app and open{" "}
            <Link to="/settings" className="text-neuron-accent font-medium hover:underline">
              Settings
            </Link>
            .
          </li>
          <li>
            Optionally set a label (e.g. <em>laptop</em>), then click <strong className="text-neuron-primary">Generate new key</strong>.
          </li>
          <li>Copy the key once — it starts with <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">nrn_</code>.</li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">3. Install the SDK</h2>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          From the <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">sdk</code> folder in this repo
          (sibling to <code className="text-[12px] font-mono bg-neuron-muted px-1.5 py-0.5 rounded">backend</code>):
        </p>
        <CodeBlock title="Shell">{`cd sdk
pip install -e .
# For activation-based BCI (TransformerLens + probe dataloader):
pip install -e ".[activations]"
# For the full local demo (Trainer + datasets + HF fine-tune script):
pip install -e ".[demo]"`}</CodeBlock>
        <p className="text-[13px] text-neuron-mutedText font-sans leading-relaxed">
          This installs the <code className="font-mono text-[12px]">neuron-sdk</code> package so you can{" "}
          <code className="font-mono text-[12px]">import neuron</code> in your training code. The{" "}
          <code className="font-mono text-[12px]">[activations]</code> extra adds{" "}
          <code className="font-mono text-[12px]">transformer-lens</code> for real BCI from residual-stream cosine drift.{" "}
          The <code className="font-mono text-[12px]">[demo]</code> extra includes{" "}
          <code className="font-mono text-[12px]">transformers</code>, <code className="font-mono text-[12px]">datasets</code>, and{" "}
          <code className="font-mono text-[12px]">accelerate</code> for the narrative demo script.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">4. Point the SDK at your API</h2>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          By default the SDK uses <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">http://localhost:8000</code>.
          Override if your API is elsewhere:
        </p>
        <CodeBlock title="Shell">{`export NEURON_API_URL="http://127.0.0.1:8000"`}</CodeBlock>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">5. Use in your training loop</h2>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          Call <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">init</code> once with your API key and
          the model id that matches a row in Neuron (UUID or registry name). After each epoch (or on a schedule), call{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">checkpoint</code>.
        </p>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          For a real <strong className="text-neuron-primary font-medium">Behavior Change Index</strong>, pass a fixed{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">probe_dataloader</code> (batches with{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">input_ids</code>) and a{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">transformer_lens.HookedTransformer</code>{" "}
          model. Freeze a baseline with <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">neuron.snapshot_hooked_baseline(model)</code> after your first checkpoint, then pass it as{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">hooked_baseline</code> on later epochs. The first call can use{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">hooked_baseline=None</code> (BCI 0).
        </p>
        <CodeBlock title="train.py (HookedTransformer + probe)">{`from transformer_lens import HookedTransformer
import neuron

neuron.init(api_key="nrn_your_key_here", model_id="your-model-id-or-uuid")

hooked = HookedTransformer.from_pretrained("gpt2", device="cuda")
probe_dataloader = your_fixed_probe_batches(hooked)  # list/DataLoader; each batch has tensor input_ids

baseline_hooked = None
for epoch in range(num_epochs):
    train_one_epoch(hooked, data)
    neuron.checkpoint(
        hooked,
        epoch=epoch,
        probe_dataloader=probe_dataloader,
        hooked_baseline=baseline_hooked,
    )
    if epoch == 0:
        baseline_hooked = neuron.snapshot_hooked_baseline(hooked)`}</CodeBlock>
        <p className="text-[13px] text-neuron-mutedText font-sans leading-relaxed">
          Optional: <code className="font-mono text-[12px]">baseline_id</code>, <code className="font-mono text-[12px]">fail_on</code>
          , <code className="font-mono text-[12px]">layers_to_monitor</code> in <code className="font-mono text-[12px]">init</code>{" "}
          or per <code className="font-mono text-[12px]">checkpoint</code>, or{" "}
          <code className="font-mono text-[12px]">block_on_high_risk=True</code> to fail CI when risk exceeds a threshold (see{" "}
          <code className="font-mono text-[12px]">sdk/neuron_sdk.py</code>
          ).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">6. What happens on each checkpoint</h2>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          The SDK POSTs a lightweight state summary to{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">/api/v1/sdk/checkpoint</code>. When you pass{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">probe_dataloader</code>, it also sends a{" "}
          client-computed <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">behavior_change_index</code>{" "}
          from mean residual-stream cosine drift vs your frozen baseline. The API applies risk thresholds and stores the checkpoint.
          Check the terminal for lines like{" "}
          <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">[neuron] Epoch N | BCI: … | Risk: …</code>
          .
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display font-semibold text-[16px] text-neuron-primary">7. Local demo script</h2>
        <p className="text-[14px] text-neuron-secondary font-sans leading-relaxed">
          The repo includes <code className="font-mono text-[12px] bg-neuron-muted px-1.5 py-0.5 rounded">sdk/demo_retraining_narrative.py</code>{" "}
          (install <code className="font-mono text-[12px]">[demo]</code>). It fine-tunes <code className="font-mono text-[12px]">gpt2</code> for a few steps on a small slice of{" "}
          <code className="font-mono text-[12px]">allenai/real-toxicity-prompts</code>, then posts checkpoints with activation-based BCI. Downloads model weights and the dataset on first run. Set{" "}
          <code className="font-mono text-[12px]">NEURON_API_KEY</code> in <code className="font-mono text-[12px]">backend/.env</code>{" "}
          or your environment and run it against a running API.
        </p>
      </section>

      <p className="text-[13px] text-neuron-mutedText font-sans pt-4 border-t border-neuron-border">
        Questions? Use{" "}
        <Link to="/settings" className="text-neuron-accent font-medium hover:underline">
          Settings → API keys
        </Link>{" "}
        and ensure your API URL matches where uvicorn is listening.
      </p>
    </div>
  );
}
