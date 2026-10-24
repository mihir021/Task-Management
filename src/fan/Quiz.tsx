import React, { useState } from "react";
const questions = [
  {
    q: "The city goes quiet. What do you check first?",
    a: [
      "The people closest to the problem.",
      "The signal nobody else noticed.",
      "The quickest route through the rooftops.",
    ],
  },
  {
    q: "Your plan just broke. Your next move?",
    a: [
      "Ask who needs help right now.",
      "Take it apart and make something smarter.",
      "Trust the instinct and improvise.",
    ],
  },
  {
    q: "Pick something to carry into a long night.",
    a: [
      "A promise worth keeping.",
      "A notebook full of strange ideas.",
      "A little courage and good shoes.",
    ],
  },
  {
    q: "What makes a team stronger?",
    a: [
      "Showing up, even when it is inconvenient.",
      "Making room for a better idea.",
      "Giving someone the confidence to jump.",
    ],
  },
  {
    q: "The perfect ending to a difficult day?",
    a: [
      "Knowing somebody got home safely.",
      "A stubborn problem finally solved.",
      "One last leap into an open sky.",
    ],
  },
];
const results = [
  {
    title: "The Neighborhood Protector",
    copy: "Your first instinct is to show up. You see the person inside the problem, and you know that being dependable can be its own kind of extraordinary.",
  },
  {
    title: "The Restless Inventor",
    copy: "You see a prototype where other people see a dead end. Your strength is curiosity: the next good question is always worth following.",
  },
  {
    title: "The Rooftop Improviser",
    copy: "You find your balance in motion. Quick thinking, an open mind, and the courage to adjust mid-flight turn uncertainty into your next route forward.",
  },
];
export function SlingerQuiz() {
  const [answers, setAnswers] = useState<number[]>([]),
    [step, setStep] = useState(0),
    [done, setDone] = useState(false),
    [copied, setCopied] = useState(false);
  const question = questions[step],
    scores = results.map((_, i) => answers.filter((v) => v === i).length),
    result = results[scores.indexOf(Math.max(...scores))];
  return (
    <div className="ink-panel quiz-panel">
      {done ? (
        <>
          <span className="fan-label">YOUR ORIGINAL ARCHETYPE / 05 OF 05</span>
          <h3>{result.title}</h3>
          <p>{result.copy}</p>
          <div className="fan-actions">
            <button
              className="fan-button red"
              onClick={() => {
                setAnswers([]);
                setStep(0);
                setDone(false);
                setCopied(false);
              }}
            >
              Try a different thread ↺
            </button>
            <button
              className="fan-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `My Thread City archetype: ${result.title}. ${result.copy}`,
                  );
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied ✓" : "Copy result ↗"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="quiz-progress"
            aria-label={`Question ${step + 1} of 5`}
          >
            {questions.map((_, i) => (
              <span key={i} className={i <= step ? "active" : ""} />
            ))}
          </div>
          <span className="fan-label">QUESTION 0{step + 1} / 05</span>
          <h3>{question.q}</h3>
          <fieldset>
            <legend className="fan-sr">
              Choose the answer that sounds like you
            </legend>
            {question.a.map((answer, i) => (
              <label key={answer}>
                <input
                  name={`question-${step}`}
                  type="radio"
                  checked={answers[step] === i}
                  onChange={() =>
                    setAnswers((previous) => {
                      const next = [...previous];
                      next[step] = i;
                      return next;
                    })
                  }
                />
                <span>{answer}</span>
              </label>
            ))}
          </fieldset>
          <div className="fan-actions">
            <button
              className="fan-button"
              disabled={!step}
              onClick={() => setStep(step - 1)}
            >
              ← Back
            </button>
            <button
              className="fan-button red"
              disabled={answers[step] === undefined}
              onClick={() => (step === 4 ? setDone(true) : setStep(step + 1))}
            >
              {step === 4 ? "Reveal my archetype ↗" : "Next question →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
