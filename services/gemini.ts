import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const analyzeBoardPosition = async (fen: string, turn: string): Promise<AnalysisResult> => {
  if (!apiKey) {
    return {
      evaluation: "Error",
      explanation: "API Key not configured."
    };
  }

  try {
    const prompt = `
      You are a Chess Grandmaster. Analyze the following chess position provided in FEN notation.
      FEN: ${fen}
      Active Player: ${turn === 'w' ? 'White' : 'Black'}

      Provide a concise analysis in JSON format with the following keys:
      - evaluation: A string indicating who is winning (e.g., "White is winning", "Equal", "Black has slight advantage").
      - explanation: A short paragraph (max 3 sentences) explaining the key strategic features of the position.
      - bestMove: Suggest the single best move for the active player in Standard Algebraic Notation (SAN).

      Do not use markdown formatting in the output, just the raw JSON string.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text);
    return {
      evaluation: result.evaluation || "Unknown",
      explanation: result.explanation || "Could not analyze position.",
      bestMove: result.bestMove
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      evaluation: "Analysis Failed",
      explanation: "Unable to retrieve analysis at this time."
    };
  }
};