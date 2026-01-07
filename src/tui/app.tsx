/**
 * TUI Application Entry Point
 */

import React from "react";
import { render, Text } from "ink";

function App(): React.ReactElement {
  return <Text>ag-cl TUI - Loading...</Text>;
}

export function startTUI(): void {
  render(<App />);
}
