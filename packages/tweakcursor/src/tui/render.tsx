import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { App, type AppProps } from "./App.js";

/**
 * Ink requires a raw-mode-capable stdin. When stdin is piped (scripts, tests,
 * CI), feed it through a PassThrough stamped with the TTY surface Ink checks.
 */
function pipedStdin(): NodeJS.ReadStream {
  const stream = new PassThrough();
  const enhanced = Object.assign(stream, {
    isTTY: true,
    setRawMode: () => stream,
    ref: () => stream,
    unref: () => stream,
  });
  process.stdin.pipe(stream);
  return enhanced as unknown as NodeJS.ReadStream;
}

/** Renders the wizard and resolves when the user exits. */
export async function renderApp(props: AppProps): Promise<void> {
  const stdin = process.stdin.isTTY ? process.stdin : pipedStdin();
  const { waitUntilExit } = render(<App {...props} />, { stdin });
  await waitUntilExit();
}
