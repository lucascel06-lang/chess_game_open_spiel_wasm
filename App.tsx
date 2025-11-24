import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { GameStats } from './types';
import { getBestMoveMCTS } from './services/ai';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// --- Assets ---
const PIECE_IMAGES: Record<string, string> = {
  w: {
    p: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    n: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    b: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    r: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    q: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    k: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  },
  b: {
    p: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    n: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    r: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    q: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    k: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  }
} as any;

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
};

// --- Helper Components ---

const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent"></div>
);

const MaterialChart = ({ history }: { history: { moveNumber: number; advantage: number }[] }) => {
  if (history.length < 2) return null;
  
  return (
    <div className="h-32 w-full mt-4 bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history}>
          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
            itemStyle={{ color: '#818cf8' }}
            labelStyle={{ display: 'none' }}
            formatter={(value: number) => [`${value > 0 ? '+' : ''}${value}`, 'Advantage']}
          />
          <Line 
            type="monotone" 
            dataKey="advantage" 
            stroke="#818cf8" 
            strokeWidth={2} 
            dot={false}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  // Game State
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<string>('');
  
  // Game Mode
  const [gameMode, setGameMode] = useState<'PvP' | 'PvAI'>('PvP');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Stats
  const [stats, setStats] = useState<GameStats>({
    whiteMaterial: 0,
    blackMaterial: 0,
    advantage: 0,
    history: [{ moveNumber: 0, advantage: 0 }]
  });

  // Calculate material stats
  useEffect(() => {
    const board = game.board();
    let w = 0;
    let b = 0;

    board.forEach(row => {
      row.forEach(piece => {
        if (piece) {
          const val = PIECE_VALUES[piece.type] || 0;
          if (piece.color === 'w') w += val;
          else b += val;
        }
      });
    });

    const adv = w - b;
    setStats(prev => ({
      whiteMaterial: w,
      blackMaterial: b,
      advantage: adv,
      history: [...prev.history, { moveNumber: game.moveNumber(), advantage: adv }]
    }));
  }, [fen]); 

  // Status check
  useEffect(() => {
    if (game.isCheckmate()) setGameStatus(`Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`);
    else if (game.isDraw()) setGameStatus('Draw!');
    else if (game.isCheck()) setGameStatus('Check!');
    else setGameStatus('');
  }, [fen, game]);

  // AI Turn Handler
  useEffect(() => {
    if (gameMode === 'PvAI' && game.turn() === 'b' && !game.isGameOver()) {
        setIsAiThinking(true);
        // Small delay to allow UI to render the user's move before AI blocks thread
        const timer = setTimeout(() => {
            const bestMove = getBestMoveMCTS(game.fen());
            if (bestMove) {
                try {
                    game.move(bestMove);
                    setFen(game.fen());
                    setHistory(game.history());
                } catch (e) {
                    console.error("AI Move failed", e);
                }
            }
            setIsAiThinking(false);
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [fen, gameMode, game]);

  // Handle Square Click
  const onSquareClick = (square: string) => {
    // Block interaction if AI is thinking or game over
    if (isAiThinking || game.isGameOver()) return;
    // Block playing as black in PvAI (assuming Player is White)
    if (gameMode === 'PvAI' && game.turn() === 'b') return;

    // If we have a selected square, try to move
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      try {
        const move = game.move({
          from: selectedSquare,
          to: square,
          promotion: 'q', 
        });

        if (move) {
          setFen(game.fen());
          setHistory(game.history());
          setSelectedSquare(null);
          setValidMoves([]);
          return;
        }
      } catch (e) {
        // Invalid move
      }
    }

    const piece = game.get(square as any);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      setValidMoves(moves.map((m: any) => m.to));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const handleReset = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setHistory([]);
    setStats({
        whiteMaterial: 0,
        blackMaterial: 0,
        advantage: 0,
        history: [{ moveNumber: 0, advantage: 0 }]
    });
    setSelectedSquare(null);
    setValidMoves([]);
    setGameStatus('');
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const board = game.board();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row p-4 md:p-8 gap-8 justify-center items-start">
      
      {/* Left Panel: Game Board */}
      <div className="flex flex-col gap-6 w-full max-w-[600px]">
        {/* Header */}
        <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-4"/><path d="M8 18v-2"/><path d="M16 18v-6"/></svg>
             </div>
             <div>
               <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Grandmaster IO</h1>
               <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${game.turn() === 'w' ? 'bg-white' : 'bg-slate-600'}`}></span>
                  {game.turn() === 'w' ? "White's Turn" : "Black's Turn"}
                  {isAiThinking && <span className="text-indigo-400 ml-2 animate-pulse">AI is thinking...</span>}
               </div>
             </div>
          </div>
          <button 
            onClick={handleReset}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Reset Game"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>

        {/* The Board */}
        <div className="relative aspect-square w-full bg-slate-800 rounded-lg shadow-2xl overflow-hidden border-4 border-slate-700">
            {gameStatus && (
                <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-slate-900 border border-emerald-500/50 p-6 rounded-xl shadow-2xl transform animate-bounce-in text-center">
                        <h2 className="text-3xl font-bold text-emerald-400 mb-2">{gameStatus}</h2>
                        <button onClick={handleReset} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-semibold transition-all">New Game</button>
                    </div>
                </div>
            )}
            
            <div className="w-full h-full grid grid-rows-8">
                {board.map((row, rankIndex) => (
                    <div key={rankIndex} className="grid grid-cols-8 h-full">
                        {row.map((piece, fileIndex) => {
                            const squareName = `${files[fileIndex]}${ranks[rankIndex]}`;
                            const isDark = (rankIndex + fileIndex) % 2 === 1;
                            const isSelected = selectedSquare === squareName;
                            const isValidMove = validMoves.includes(squareName);
                            const isLastMove = history.length > 0 && 
                                               (game.history({ verbose: true }).pop()?.to === squareName || 
                                                game.history({ verbose: true }).pop()?.from === squareName);

                            return (
                                <div
                                    key={squareName}
                                    onClick={() => onSquareClick(squareName)}
                                    className={`
                                        relative flex items-center justify-center cursor-pointer select-none transition-colors duration-100
                                        ${isDark ? 'bg-slate-600' : 'bg-slate-300'}
                                        ${isSelected ? '!bg-indigo-500 ring-inset ring-4 ring-indigo-300' : ''}
                                        ${isLastMove && !isSelected ? 'after:absolute after:inset-0 after:bg-yellow-400/30' : ''}
                                        ${isValidMove && !piece ? 'after:content-[""] after:w-3 after:h-3 after:bg-emerald-500/50 after:rounded-full' : ''}
                                        ${isValidMove && piece ? 'after:absolute after:inset-0 after:border-4 after:border-emerald-500/50 after:rounded-none' : ''}
                                    `}
                                >
                                    {/* Rank/File Labels */}
                                    {fileIndex === 0 && (
                                        <span className={`absolute top-0.5 left-1 text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {ranks[rankIndex]}
                                        </span>
                                    )}
                                    {rankIndex === 7 && (
                                        <span className={`absolute bottom-0 right-1 text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {files[fileIndex]}
                                        </span>
                                    )}

                                    {piece && (
                                        <img 
                                            src={PIECE_IMAGES[piece.color][piece.type]} 
                                            alt={`${piece.color} ${piece.type}`}
                                            className="w-[85%] h-[85%] object-contain drop-shadow-lg transform transition-transform hover:scale-110 active:scale-95 z-10 pointer-events-none"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* Right Panel: Controls & Info */}
      <div className="w-full md:w-[400px] flex flex-col gap-6">
        
        {/* Game Mode Selector */}
        <div className="bg-slate-800 p-2 rounded-xl border border-slate-700 flex gap-2">
            <button 
                onClick={() => { setGameMode('PvP'); handleReset(); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${gameMode === 'PvP' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}`}
            >
                Player vs Player
            </button>
            <button 
                onClick={() => { setGameMode('PvAI'); handleReset(); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${gameMode === 'PvAI' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}`}
            >
                Player vs MCTS AI
            </button>
        </div>

        {/* User Info / Turn Indicator (Pseudo-auth UI) */}
        <div className="flex gap-4">
             {/* Opponent (Top) */}
             <div className="flex-1 bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 relative overflow-hidden">
                <div className="flex items-center gap-3 relative z-10">
                    <img src={gameMode === 'PvAI' ? "https://robohash.org/opponent?set=set1" : "https://picsum.photos/40/40?random=2"} alt="Black" className="w-10 h-10 rounded-full border-2 border-slate-600" />
                    <div>
                        <p className="font-semibold text-slate-200">{gameMode === 'PvAI' ? 'MCTS Bot' : 'Opponent'}</p>
                    </div>
                </div>
                {game.turn() === 'b' && <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500 animate-pulse"></div>}
             </div>

             {/* Player (Bottom) */}
             <div className="flex-1 bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 relative overflow-hidden">
                <div className="flex items-center gap-3 relative z-10">
                    <img src="https://picsum.photos/40/40?random=1" alt="White" className="w-10 h-10 rounded-full border-2 border-indigo-500" />
                    <div>
                        <p className="font-semibold text-slate-200">You</p>
                    </div>
                </div>
                {game.turn() === 'w' && <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500 animate-pulse"></div>}
             </div>
        </div>

        {/* Stats & History */}
        <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 flex-1 flex flex-col min-h-[300px]">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Match Statistics</h3>
            
            {/* Advantage Bar */}
            <div className="flex items-center gap-4 text-sm font-medium mb-2">
                <div className="flex-1 text-right text-slate-300">White</div>
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden flex">
                    <div 
                        className="h-full bg-white transition-all duration-500" 
                        style={{ width: `${50 + (stats.advantage * 5)}%` }} 
                    />
                </div>
                <div className="flex-1 text-left text-slate-300">Black</div>
            </div>
            <div className="text-center text-xs text-slate-500 mb-4">
                Material Difference: <span className={stats.advantage > 0 ? 'text-green-400' : stats.advantage < 0 ? 'text-red-400' : 'text-slate-400'}>
                    {stats.advantage > 0 ? `+${stats.advantage}` : stats.advantage}
                </span>
            </div>

            {/* Recharts History */}
            <MaterialChart history={stats.history} />

            {/* Move History Text */}
            <div className="mt-6 flex-1 overflow-y-auto max-h-[200px] border border-slate-700/50 rounded-lg bg-slate-900/30 p-2">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="text-slate-500 border-b border-slate-700/50">
                            <th className="py-2 pl-2">#</th>
                            <th className="py-2">White</th>
                            <th className="py-2">Black</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                            <tr key={i} className="hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 last:border-0">
                                <td className="py-1.5 pl-2 text-slate-500 font-mono text-xs">{i + 1}.</td>
                                <td className="py-1.5 text-slate-300 font-medium">{history[i * 2]}</td>
                                <td className="py-1.5 text-slate-300 font-medium">{history[i * 2 + 1] || ''}</td>
                            </tr>
                        ))}
                        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </tbody>
                </table>
                {history.length === 0 && (
                    <div className="text-center text-slate-600 italic py-4">Game start</div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;