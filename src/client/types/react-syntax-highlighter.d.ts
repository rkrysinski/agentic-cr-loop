declare module "react-syntax-highlighter" {
  import type { ComponentType, ReactNode } from "react";

  export const PrismLight: ComponentType<{
    children?: ReactNode;
    [key: string]: unknown;
  }> & {
    registerLanguage: (name: string, language: unknown) => void;
  };
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
  const language: unknown;
  export default language;
}
