import '@mantine/core';

declare module '@mantine/core' {
  interface TextProps {
    letterSpacing?: string | number;
  }
}
