import { NextRequest, NextResponse } from "next/server";
import type { GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion } from "@/lib/types";

// Mock generator returns deterministic sample questions when no API key is configured
function generateMockQuestions(req: GenerateQuestionsRequest): GeneratedQuestion[] {
  const templates: Record<string, GeneratedQuestion[]> = {
    default: [
      {
        prompt: `What is a key fact about ${req.topic}?`,
        choices: [
          { text: "The most commonly known fact", isCorrect: true },
          { text: "A popular misconception", isCorrect: false },
          { text: "An unrelated statement", isCorrect: false },
          { text: "A partially true claim", isCorrect: false },
        ],
      },
      {
        prompt: `Which year is most associated with ${req.topic}?`,
        choices: [
          { text: "1999", isCorrect: false },
          { text: "2005", isCorrect: true },
          { text: "2010", isCorrect: false },
          { text: "1985", isCorrect: false },
        ],
      },
      {
        prompt: `Who is best known for their contribution to ${req.topic}?`,
        choices: [
          { text: "Person A", isCorrect: false },
          { text: "Person B", isCorrect: false },
          { text: "Person C", isCorrect: true },
          { text: "Person D", isCorrect: false },
        ],
      },
      {
        prompt: `What category does ${req.topic} primarily belong to?`,
        choices: [
          { text: "Science", isCorrect: false },
          { text: "History", isCorrect: false },
          { text: "Entertainment", isCorrect: true },
          { text: "Sports", isCorrect: false },
        ],
      },
      {
        prompt: `Which of these is NOT related to ${req.topic}?`,
        choices: [
          { text: "Related concept A", isCorrect: false },
          { text: "Unrelated concept", isCorrect: true },
          { text: "Related concept C", isCorrect: false },
          { text: "Related concept D", isCorrect: false },
        ],
      },
    ],
  };

  const base = templates.default;
  const questions: GeneratedQuestion[] = [];

  for (let i = 0; i < req.count; i++) {
    const template = base[i % base.length];
    questions.push({
      prompt: template.prompt,
      choices: template.choices.map((c) => ({ ...c })),
      explanation: `This is a sample explanation for question ${i + 1} about ${req.topic}.`,
    });
  }

  return questions;
}

function generateMockWrongAnswers(correctAnswer: string): string[] {
  return [
    `Not ${correctAnswer} (option A)`,
    `Not ${correctAnswer} (option B)`,
    `Not ${correctAnswer} (option C)`,
  ];
}

// Real LLM-based generator
async function generateWithAI(req: GenerateQuestionsRequest): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.AI_API_KEY!;
  const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  const systemPrompt = `You are a trivia question generator. Generate exactly ${req.count} multiple-choice trivia questions.
Each question must have exactly 4 answer choices, with exactly 1 correct answer and 3 wrong answers.
Target audience: ${req.ageRange.replace("_", " ")}. Difficulty: ${req.difficulty}.
Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "prompt": "The question text",
      "choices": [
        { "text": "Answer A", "isCorrect": false },
        { "text": "Answer B", "isCorrect": true },
        { "text": "Answer C", "isCorrect": false },
        { "text": "Answer D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of the correct answer"
    }
  ]
}`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${req.count} trivia questions about: ${req.topic}` },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`AI API returned ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed.questions;
}

async function generateWrongAnswersWithAI(
  questionPrompt: string,
  correctAnswer: string,
  topic: string
): Promise<string[]> {
  const apiKey = process.env.AI_API_KEY!;
  const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  const systemPrompt = `You generate plausible but incorrect answer choices for trivia questions.
Given a question and its correct answer, generate exactly 3 wrong but believable answer choices.
Return ONLY valid JSON in this exact format:
{
  "wrongAnswers": ["Wrong A", "Wrong B", "Wrong C"]
}`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Topic: ${topic}\nQuestion: ${questionPrompt}\nCorrect answer: ${correctAnswer}\n\nGenerate 3 plausible wrong answers.`,
        },
      ],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`AI API returned ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed.wrongAnswers;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode: string = body.mode || "questions";

    if (mode === "wrong_answers") {
      const { questionPrompt, correctAnswer, topic } = body;
      if (!questionPrompt || !correctAnswer) {
        return NextResponse.json(
          { error: "Provide questionPrompt and correctAnswer." },
          { status: 400 }
        );
      }

      let wrongAnswers: string[];
      if (process.env.AI_API_KEY) {
        wrongAnswers = await generateWrongAnswersWithAI(
          questionPrompt,
          correctAnswer,
          topic || ""
        );
      } else {
        wrongAnswers = generateMockWrongAnswers(correctAnswer);
      }

      return NextResponse.json({ wrongAnswers });
    }

    // Default: generate full questions
    const questionsReq: GenerateQuestionsRequest = body;
    if (!questionsReq.topic || !questionsReq.count || questionsReq.count < 1 || questionsReq.count > 20) {
      return NextResponse.json(
        { error: "Invalid request. Provide topic and count (1-20)." },
        { status: 400 }
      );
    }

    let questions: GeneratedQuestion[];

    if (process.env.AI_API_KEY) {
      questions = await generateWithAI(questionsReq);
    } else {
      // Fallback to mock generator
      questions = generateMockQuestions(questionsReq);
    }

    const response: GenerateQuestionsResponse = {
      topic: questionsReq.topic,
      ageRange: questionsReq.ageRange,
      difficulty: questionsReq.difficulty,
      questions,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Question generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
