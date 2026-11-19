// custom-elements.d.ts
// Chessground-style tags used directly in JSX. React 19 reads JSX types from
// the 'react' module, not the global JSX namespace.
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      move: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
