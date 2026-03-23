import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/api.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("demo@neuron.ai");
  const [password, setPassword] = useState("demo");
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="glass w-full max-w-md p-8 rounded-sm space-y-4">
        <div className="font-mono text-cyan-accent text-xs tracking-[0.25em]">NEURON</div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-slate-400">Demo: demo@neuron.ai / demo</p>
        <label className="block text-sm">
          <span className="text-slate-400 font-mono text-xs">EMAIL</span>
          <input
            className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400 font-mono text-xs">PASSWORD</span>
          <input
            type="password"
            className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {err && <div className="text-critical text-sm">{err}</div>}
        <button
          type="submit"
          className="w-full py-2 bg-cyan-accent/90 text-navy font-semibold font-mono text-sm hover:bg-cyan-accent"
        >
          AUTHENTICATE
        </button>
      </form>
    </div>
  );
}
