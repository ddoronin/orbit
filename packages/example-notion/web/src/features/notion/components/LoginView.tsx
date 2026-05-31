import React, { useCallback, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useAppStore, showErrorToast } from "../store";

export function LoginView(): JSX.Element {
  const login = useAppStore((state) => state.login);
  const [name, setName] = useState("");
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const onNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setName(event.target.value);
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;

      try {
        await login(trimmedName);
      } catch (error) {
        showErrorToast(error, "Login failed");
      }
    },
    [canSubmit, login, trimmedName],
  );

  return (
    <section className="flex h-full items-center justify-center bg-gradient-to-b from-[#faf9f7] to-[#f1eee8]">
      <div className="w-[380px] rounded-xl border border-zinc-200 bg-white p-10 shadow-notion">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Orbit Notion
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          A tiny Notion-like demo running on Cloudflare Workers + Durable
          Objects.
        </p>

        <form onSubmit={onSubmit}>
          <label
            htmlFor="display-name"
            className="mb-4 block text-sm text-zinc-500"
          >
            Display name
            <Input
              id="display-name"
              type="text"
              placeholder="Alice"
              autoComplete="off"
              required
              className="mt-1"
              value={name}
              onChange={onNameChange}
            />
          </label>
          <Button type="submit" className="mt-2 w-full" disabled={!canSubmit}>
            Enter
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Open a second browser window with a different name to see live
          presence.
        </p>
      </div>
    </section>
  );
}
