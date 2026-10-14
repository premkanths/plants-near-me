'use client';

import { useState } from 'react';
import Link from 'next/link';

interface QuizState {
  placement: 'INDOOR' | 'OUTDOOR' | 'BOTH';
  sunlight: 'FULL_SUN' | 'PARTIAL_SUN' | 'SHADE';
  petFriendly: boolean;
}

const SAMPLE_MATCHES = [
  {
    title: 'Peace Lily (Spathiphyllum)',
    placement: 'INDOOR',
    sunlight: 'SHADE',
    petFriendly: false,
    price: '349.00',
    reason: 'Thrives in indirect light and purifies indoor room air gently.',
    badge: '🍃 Air Purifier',
    icon: '🪴',
    slug: 'peace-lily',
  },
  {
    title: 'Boston Fern',
    placement: 'INDOOR',
    sunlight: 'PARTIAL_SUN',
    petFriendly: true,
    price: '299.00',
    reason: 'Non-toxic to cats and dogs! Enjoys humid indoor environments.',
    badge: '🐾 Pet Safe',
    icon: '🌿',
    slug: 'boston-fern',
  },
  {
    title: 'Bougainvillea Pink',
    placement: 'OUTDOOR',
    sunlight: 'FULL_SUN',
    petFriendly: true,
    price: '450.00',
    reason: 'Loves full sunlight and produces vibrant year-round blooms.',
    badge: '🌸 Vivid Blooms',
    icon: '🌺',
    slug: 'bougainvillea',
  },
  {
    title: 'Snake Plant (Sansevieria)',
    placement: 'INDOOR',
    sunlight: 'SHADE',
    petFriendly: false,
    price: '399.00',
    reason: 'Ultra low maintenance. Perfect for bedroom corners and offices.',
    badge: '⚡ Low Maintenance',
    icon: '🌾',
    slug: 'snake-plant',
  },
];

export function PlantQuizWidget() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [quiz, setQuiz] = useState<QuizState>({
    placement: 'INDOOR',
    sunlight: 'PARTIAL_SUN',
    petFriendly: true,
  });

  const matched = SAMPLE_MATCHES.filter((m) => {
    if (quiz.petFriendly && !m.petFriendly) return false;
    if (m.placement !== 'BOTH' && quiz.placement !== m.placement) return false;
    return true;
  });

  const bestMatch = matched.length > 0 ? matched[0] : SAMPLE_MATCHES[0];

  return (
    <div className="w-full rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/40 p-6 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/20 dark:via-zinc-900 dark:to-emerald-950/10 md:p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 mb-3">
          ✨ Plant Matchmaker Quiz
        </div>
        <h3 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
          Find your ideal plant in 30 seconds
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Answer 3 simple questions and our botanical algorithm finds your perfect match.
        </p>
      </div>

      <div className="mt-6 mx-auto max-w-xl">
        {step === 1 && (
          <div className="space-y-4 text-center animate-fadeIn">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Step 1 of 3: Where will your plant live?
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Indoor Room', val: 'INDOOR', icon: '🏠' },
                { label: 'Balcony / Garden', val: 'OUTDOOR', icon: '☀️' },
                { label: 'Versatile / Both', val: 'BOTH', icon: '🪴' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => {
                    setQuiz((q) => ({ ...q, placement: opt.val as any }));
                    setStep(2);
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition ${
                    quiz.placement === opt.val
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
                      : 'border-zinc-200 bg-white hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  <span className="text-3xl mb-1">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-center animate-fadeIn">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Step 2 of 3: How much natural light does the spot get?
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Direct Sun (4+ hrs)', val: 'FULL_SUN', icon: '☀️' },
                { label: 'Bright Indirect', val: 'PARTIAL_SUN', icon: '🌤️' },
                { label: 'Low / Shade', val: 'SHADE', icon: '☁️' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => {
                    setQuiz((q) => ({ ...q, sunlight: opt.val as any }));
                    setStep(3);
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition ${
                    quiz.sunlight === opt.val
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
                      : 'border-zinc-200 bg-white hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  <span className="text-3xl mb-1">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline mt-2"
            >
              ← Back to Step 1
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center animate-fadeIn">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Step 3 of 3: Do you have pets (cats or dogs) at home?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setQuiz((q) => ({ ...q, petFriendly: true }));
                  setStep(4);
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-white p-5 text-center transition hover:border-emerald-500 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800"
              >
                <span className="text-4xl mb-2">🐾</span>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Yes, Pet Safe Only</span>
                <span className="mt-1 text-[11px] text-zinc-500">Non-toxic to curious pets</span>
              </button>
              <button
                onClick={() => {
                  setQuiz((q) => ({ ...q, petFriendly: false }));
                  setStep(4);
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-5 text-center transition hover:border-emerald-500 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800"
              >
                <span className="text-4xl mb-2">🌿</span>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No Pets / Any Plant</span>
                <span className="mt-1 text-[11px] text-zinc-500">Show all suitable plants</span>
              </button>
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline mt-2"
            >
              ← Back to Step 2
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-md dark:border-emerald-800 dark:bg-zinc-900 flex flex-col sm:flex-row items-center gap-5">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-5xl dark:bg-emerald-950">
                {bestMatch.icon}
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {bestMatch.badge}
                </span>
                <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {bestMatch.title}
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {bestMatch.reason}
                </p>
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    ₹{bestMatch.price}
                  </span>
                  <Link
                    href={`/search?q=${encodeURIComponent(bestMatch.title)}`}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-sm"
                  >
                    Find in Nearby Nurseries →
                  </Link>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setStep(1)}
                className="text-xs text-emerald-700 font-medium hover:underline dark:text-emerald-400"
              >
                🔄 Retake Quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
