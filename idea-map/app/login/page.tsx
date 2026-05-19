"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pin, setPin] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const router = useRouter();

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...pin];
    next[index] = value;
    setPin(next);
    setError("");
    if (value && index < 3) inputs[index + 1].current?.focus();
    if (next.every(d => d !== "") && index === 3) submit(next.join(""));
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputs[index - 1].current?.focus();
    }
  }

  async function submit(code: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("PINが違います");
        setPin(["", "", "", ""]);
        inputs[0].current?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-8"
      style={{ background: "#f5f3ff" }}
    >
      {/* ロゴ */}
      <div className="text-center">
        <div style={{ fontSize: 64 }}>🗺️</div>
        <h1
          className="font-black text-2xl tracking-widest uppercase mt-2"
          style={{ color: "#1e1a3a", fontFamily: "Georgia, serif", letterSpacing: "4px" }}
        >
          IDEA MAP
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8b85a8" }}>
          4桁のPINを入力してください
        </p>
      </div>

      {/* PIN入力 */}
      <div className="flex gap-3">
        {pin.map((digit, i) => (
          <input
            key={i}
            ref={inputs[i]}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            autoFocus={i === 0}
            className="w-14 h-14 text-center text-2xl font-black rounded-2xl outline-none transition-all"
            style={{
              background: "white",
              border: `2px solid ${digit ? "#7c3aed" : "#e4e0f5"}`,
              color: "#1e1a3a",
              boxShadow: digit ? "0 0 0 3px #c4b3f840" : "none",
            }}
          />
        ))}
      </div>

      {/* エラー */}
      {error && (
        <p className="text-sm font-semibold" style={{ color: "#e11d48" }}>
          ❌ {error}
        </p>
      )}

      {/* ローディング */}
      {loading && (
        <p className="text-sm" style={{ color: "#8b85a8" }}>確認中…</p>
      )}
    </div>
  );
}
