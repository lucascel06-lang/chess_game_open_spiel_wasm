export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Square {
  square: string;
  type: PieceType;
  color: PieceColor;
}

export interface GameStats {
  whiteMaterial: number;
  blackMaterial: number;
  advantage: number; // Positive for white, negative for black
  history: { moveNumber: number; advantage: number }[];
}

export interface AnalysisResult {
  evaluation: string;
  bestMove?: string;
  explanation: string;
}

// Minimal definition for what we use from chess.js if the type isn't automatically inferred
// In a real setup, we'd rely on @types/chess.js
export interface ChessInstance {
  board: () => (Square | null)[][];
  move: (move: { from: string; to: string; promotion?: string }) => any;
  turn: () => PieceColor;
  fen: () => string;
  isGameOver: () => boolean;
  isCheckmate: () => boolean;
  isDraw: () => boolean;
  isCheck: () => boolean;
  history: () => string[];
  reset: () => void;
  undo: () => void;
  moves: (options?: { square?: string; verbose?: boolean }) => any[];
  get: (square: string) => Square | null;
}
