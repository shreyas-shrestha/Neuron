import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-neuron-bg text-neuron-primary flex flex-col relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `
            linear-gradient(var(--color-border) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-border) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />

      <div className="relative flex-1 flex flex-col items-center px-6 pb-24">
        <div className="w-full max-w-[640px] text-center pt-[120px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-neuron-border bg-neuron-muted/60 px-4 py-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-neuron-success animate-pulse-dot shrink-0" aria-hidden />
            <span className="text-[13px] text-neuron-secondary font-sans">Now in beta · Built at Georgia Tech</span>
          </div>

          <h1 className="font-display font-extrabold text-[52px] leading-[1.15] text-neuron-primary mt-6 max-w-[560px] mx-auto tracking-tight">
            Catch what your eval suite misses.
          </h1>

          <p className="mt-4 text-[18px] text-neuron-secondary leading-relaxed font-sans max-w-[560px] mx-auto">
            Neuron monitors what changes inside your model during retraining — not just outputs, but internal
            representations. Catch harmful feature emergence before it ships.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link to="/demo" className="btn-primary h-10 px-5">
              See Live Demo →
            </Link>
            <Link to="/login" className="btn-secondary h-10 px-5">
              Sign In
            </Link>
          </div>

          <div className="mt-12 text-center">
            <p className="text-[13px] text-neuron-mutedText tracking-wide font-sans">Trusted by ML engineers at</p>
            <div className="mt-4 flex flex-wrap justify-center gap-8 text-[13px] text-neuron-mutedText tracking-wider font-medium">
              <span>Anthropic</span>
              <span>Scale AI</span>
              <span>Cohere</span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[1100px] mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="neuron-card p-6 transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-lg">
            <div className="w-10 h-10 rounded-md bg-neuron-accent/12 border border-neuron-accent/25 text-neuron-secondary flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <h2 className="font-display font-semibold text-lg text-neuron-primary">Retrain with confidence</h2>
            <p className="mt-2 text-[15px] text-neuron-secondary leading-relaxed font-sans">
              See exactly what changed between model versions at the layer level — before you deploy.
            </p>
          </article>

          <article className="neuron-card p-6 transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-lg">
            <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/25 text-neuron-secondary flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h2 className="font-display font-semibold text-lg text-neuron-primary">Catch the Ring problem</h2>
            <p className="mt-2 text-[15px] text-neuron-secondary leading-relaxed font-sans">
              Detect harmful feature emergence during retraining. Not after it goes viral.
            </p>
          </article>

          <article className="neuron-card p-6 transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-lg">
            <div className="w-10 h-10 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-neuron-secondary flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="font-display font-semibold text-lg text-neuron-primary">Ship in minutes</h2>
            <p className="mt-2 text-[15px] text-neuron-secondary leading-relaxed font-sans">
              Add two lines to your training loop. That&apos;s the entire integration.
            </p>
            <pre className="mt-4 text-left font-mono text-[12px] leading-relaxed bg-neuron-muted border border-neuron-border rounded-sm p-3 text-neuron-primary overflow-x-auto">
              {`neuron.init(api_key="...")
neuron.checkpoint(model, epoch=epoch)`}
            </pre>
          </article>
        </div>
      </div>

      <footer className="relative border-t border-neuron-border py-8 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row justify-between gap-4 text-[13px] text-neuron-mutedText font-sans">
          <span>© 2025 Neuron · Built at Georgia Tech</span>
          <div className="flex gap-6">
            <span className="cursor-default">GitHub</span>
            <span className="cursor-default">Docs</span>
            <span className="cursor-default">Contact</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
