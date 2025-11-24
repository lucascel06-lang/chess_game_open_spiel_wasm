import { Chess } from 'chess.js';

// MCTS Configuration
const TIME_LIMIT_MS = 1000; // Time budget for the AI to think
const EXPLORATION_CONSTANT = 1.414; // UCT constant (sqrt(2))
const MAX_SIMULATION_DEPTH = 50; // Prevent infinite loops in random playouts

class MCTSNode {
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  wins: number; // For the player who made the move leading to this node
  move: string | null; // The move that led to this state
  untriedMoves: string[];
  playerJustMoved: 'w' | 'b';

  constructor(game: any, parent: MCTSNode | null = null, move: string | null = null) {
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.move = move;
    
    // Determine who just moved. If it's root (move is null), the "player just moved" is the opposite of current turn
    // so that the children (next moves) are for the current turn player.
    if (parent === null) {
        this.playerJustMoved = game.turn() === 'w' ? 'b' : 'w';
    } else {
        this.playerJustMoved = game.turn() === 'w' ? 'b' : 'w';
    }

    this.untriedMoves = game.moves();
  }

  isTerminal(game: any): boolean {
    return game.isGameOver();
  }

  isFullyExpanded(): boolean {
    return this.untriedMoves.length === 0;
  }

  uctValue(): number {
    if (this.visits === 0) return Number.MAX_VALUE;
    return (this.wins / this.visits) + 
           EXPLORATION_CONSTANT * Math.sqrt(Math.log(this.parent!.visits) / this.visits);
  }

  selectChild(): MCTSNode {
    return this.children.reduce((prev, current) => 
      (prev.uctValue() > current.uctValue()) ? prev : current
    );
  }

  addChild(move: string, game: any): MCTSNode {
    const newGame = new Chess(game.fen());
    newGame.move(move);
    
    const child = new MCTSNode(newGame, this, move);
    this.untriedMoves = this.untriedMoves.filter(m => m !== move);
    this.children.push(child);
    return child;
  }

  update(result: number) {
    this.visits++;
    this.wins += result;
  }
}

// Result from the perspective of the player at the node
// 1 = Win, 0 = Loss, 0.5 = Draw
function getSimulationResult(game: any, playerJustMoved: 'w' | 'b'): number {
  if (game.isCheckmate()) {
    // If the game ended in checkmate, the person who made the LAST move won.
    // If turn is 'w', it means 'b' checkmated 'w'.
    const winner = game.turn() === 'w' ? 'b' : 'w';
    return winner === playerJustMoved ? 1 : 0;
  }
  if (game.isDraw() || game.isThreefoldRepetition() || game.isStalemate()) {
    return 0.5;
  }
  // Should not happen if only called on terminal nodes
  return 0.5;
}

export const getBestMoveMCTS = (fen: string): string | null => {
  const rootGame = new Chess(fen);
  
  // If game over, no moves
  if (rootGame.isGameOver()) return null;

  const root = new MCTSNode(rootGame);
  const startTime = Date.now();

  // Run MCTS until time limit
  while (Date.now() - startTime < TIME_LIMIT_MS) {
    let node = root;
    const gameClone = new Chess(fen);

    // 1. Selection
    // Traverse down the tree to a node that is not fully expanded
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = node.selectChild();
      gameClone.move(node.move!);
    }

    // 2. Expansion
    // If we can expand (there are untried moves), add a child
    if (node.untriedMoves.length > 0 && !gameClone.isGameOver()) {
      const move = node.untriedMoves[Math.floor(Math.random() * node.untriedMoves.length)];
      node = node.addChild(move, gameClone);
      gameClone.move(move);
    }

    // 3. Simulation
    // Play random moves until the game ends or depth limit reached
    let depth = 0;
    while (!gameClone.isGameOver() && depth < MAX_SIMULATION_DEPTH) {
      const moves = gameClone.moves();
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      gameClone.move(randomMove);
      depth++;
    }

    // 4. Backpropagation
    // Determine result from the perspective of the player who just moved at 'node'
    let result = 0;
    if (gameClone.isGameOver()) {
        result = getSimulationResult(gameClone, node.playerJustMoved);
    } else {
        // Heuristic for incomplete simulations: Material Balance
        // If we hit depth limit, evaluate based on material
        // This makes the random rollout slightly less "dumb"
        const board = gameClone.board();
        let score = 0;
        const values: any = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        board.forEach((row: any[]) => row.forEach((p: any) => {
            if (p) {
                const val = values[p.type];
                score += p.color === node.playerJustMoved ? val : -val;
            }
        }));
        // Sigmoid-ish squash to 0-1
        result = 0.5 + (score / 100); 
        if (result > 1) result = 1;
        if (result < 0) result = 0;
    }

    // Backpropagate up the tree
    while (node !== null) {
      // Logic: 
      // If 'node' represents a move by White, and White won (result=1), we add to wins.
      // However, usually MCTS nodes alternate.
      // If the simulation result says "Player X Won", and the node.playerJustMoved was X, they get a point.
      // If node.playerJustMoved was Y, they get 0.
      
      // We calculated result relative to node.playerJustMoved.
      // But as we go up, the playerJustMoved switches.
      // If child node was White's move and resulted in White Win (1), 
      // the parent node (Black's move state) considers this a Loss (0) for Black (heuristically/minimax wise).
      // Standard MCTS update:
      // The child node stores wins for the player who MADE the move to get there.
      
      // Actually simpler: 
      // If result is 1 (Win for node.playerJustMoved), add 1.
      // If we go to parent, parent.playerJustMoved is opposite.
      // So we need to flip the result if we want "wins" to mean "wins for that node's player".
      
      // Let's stick to the definition: node.wins is how many times the player who made `node.move` won.
      // The simulation result `r` calculated above is specifically for `node.playerJustMoved`.
      // So for THIS node, we add `r`.
      // For the parent, `r` needs to be inverted (1-r) because the parent represents the opponent.
      // BUT, we recalculate `r` inside the loop relative to the current node being updated? No, that's expensive.
      
      // Easier path: The simulation ended. Who won? 'w', 'b', or draw.
      // Let's re-eval result strictly:
      let winner = 'draw';
      if (gameClone.isCheckmate()) {
        winner = gameClone.turn() === 'w' ? 'b' : 'w';
      }
      
      let val = 0.5;
      if (winner === node.playerJustMoved) val = 1;
      else if (winner !== 'draw') val = 0;
      
      node.update(val);
      node = node.parent!;
    }
  }

  // Return the child with the most visits (Robust Child)
  const sortedChildren = root.children.sort((a, b) => b.visits - a.visits);
  return sortedChildren.length > 0 ? sortedChildren[0].move : null;
};
