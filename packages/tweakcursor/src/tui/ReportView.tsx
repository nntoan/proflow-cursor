import React from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./ui.js";

export function ReportView({
  title,
  lines,
  onBack,
  onExit,
}: {
  title: string;
  lines: string[];
  onBack: () => void;
  onExit: () => void;
}) {
  useInput((input, key) => {
    if (input === "q") onExit();
    else if (key.escape || key.return || input === "m") onBack();
  });
  return (
    <Box flexDirection="column">
      <Header title={title} />
      {lines.map((line, i) => (
        <Text key={i} color={line.startsWith("FAILED") || line.startsWith("!!") ? "red" : undefined}>
          {line}
        </Text>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>re-apply after every cursor-agent update (tweakcursor --apply)</Text>
        <Text dimColor>enter/m menu · q quit</Text>
      </Box>
    </Box>
  );
}
