import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/api.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("demo@neuron.ai");
  const [password, setPassword] = useState("demo");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await login(email, password);
      nav("/");
    } catch {
      setErr("Invalid credentials");
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-neuron-bg">
      <div className="hidden lg:flex lg:w-1/2 bg-neuron-muted border-r border-neuron-border flex-col items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-xl bg-neuron-bg border-2 border-neuron-accent/45 text-neuron-primary font-display font-bold text-3xl flex items-center justify-center shadow-[0_0_40px_-12px_rgba(129,140,248,0.45)]">
            N
          </div>
          <p className="font-display font-bold text-[28px] leading-tight mt-8 text-neuron-primary">
            Catch what your eval suite misses.
          </p>
          <ul className="mt-10 space-y-4 text-left text-[15px] leading-relaxed text-neuron-secondary font-sans">
            <li className="border-l-2 border-neuron-accent/50 pl-4">Layer-by-layer behavior monitoring</li>
            <li className="border-l-2 border-neuron-accent/50 pl-4">Retraining drift detection</li>
            <li className="border-l-2 border-neuron-accent/50 pl-4">2-line SDK integration</li>
          </ul>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-neuron-bg">
        <form onSubmit={onSubmit} className="w-full max-w-[360px] space-y-5">
          <div>
            <h1 className="font-display font-bold text-2xl text-neuron-primary">Welcome back</h1>
            <p className="text-sm text-neuron-secondary mt-1 font-sans">Sign in to your workspace</p>
          </div>

          <label className="block">
            <span className="text-[13px] font-medium text-neuron-secondary font-sans">Email</span>
            <input
              className="input-neuron mt-1.5 font-sans"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-neuron-secondary font-sans">Password</span>
            <div className="relative mt-1.5">
              <input
                type={showPw ? "text" : "password"}
                className="input-neuron font-sans pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-medium text-neuron-accent hover:text-neuron-accent-hover"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {err && (
            <div className="rounded-sm border-l-[3px] border-l-neuron-danger bg-neuron-danger-light text-neuron-danger text-sm px-3 py-2 font-sans">
              {err}
            </div>
          )}

          <button type="submit" className="btn-primary w-full h-10">
            Sign in
          </button>

          <p className="text-center text-sm font-sans pt-1">
            <Link to="/demo" className="text-neuron-accent font-medium hover:text-neuron-accent-hover transition-colors duration-150">
              New here? See the live demo →
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
