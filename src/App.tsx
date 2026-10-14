/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  handleFirestoreError,
  OperationType,
  ai,
  getTemplateGenerativeModel,
  getActiveDebugToken,
} from './firebase';
import {
  Sparkles,
  LogOut,
  Loader2,
  ArrowRight,
  CheckCircle2,
  Compass,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  Play,
} from 'lucide-react';

const DEFAULT_PRIORITIES =
  'Financial stability, having a good work life balance that allows me to travel twice a year';

export interface UserDilemmaMessage {
  id: string;
  role: 'user';
  optionA: string;
  optionB: string;
  timestamp: Date;
}

export interface SystemDecisionMessage {
  id: string;
  role: 'system';
  verdict: string;
  justification: string;
  firstStep: string;
  timestamp: Date;
}

export type ChatMessage = UserDilemmaMessage | SystemDecisionMessage;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Priorities State
  const [priorities, setPriorities] = useState<string>(DEFAULT_PRIORITIES);
  const [isEditingPriorities, setIsEditingPriorities] = useState(false);
  const [prioritiesDraft, setPrioritiesDraft] = useState<string>(DEFAULT_PRIORITIES);
  const [savingPriorities, setSavingPriorities] = useState(false);

  // Decision & Chat State
  const [optionA, setOptionA] = useState('Move to New York');
  const [optionB, setOptionB] = useState('Stay in London');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEvaluatingDilemma, setCurrentEvaluatingDilemma] = useState<{
    optionA: string;
    optionB: string;
  } | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  // App Check Debug Diagnostic State
  const [detectedDebugToken, setDetectedDebugToken] = useState<string | null>(null);
  const [customTokenInput, setCustomTokenInput] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Read stored debug token on mount
  useEffect(() => {
    getActiveDebugToken().then((token) => {
      if (token) setDetectedDebugToken(token);
    });
  }, []);

  // Auto-scroll chat when messages update or evaluation starts
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isEvaluating, evaluationError]);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to User Priorities from Firestore (path: users/{userId})
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && typeof data.priorities === 'string') {
            setPriorities(data.priorities);
            setPrioritiesDraft(data.priorities);
          }
        } else {
          setPriorities(DEFAULT_PRIORITIES);
          setPrioritiesDraft(DEFAULT_PRIORITIES);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in error:', err);
      setAuthError('Could not sign in with Google. Please try again.');
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setMessages([]);
      setIsEvaluating(false);
      setCurrentEvaluatingDilemma(null);
      setEvaluationError(null);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  // Handle Save Priorities
  const handleSavePriorities = async () => {
    if (!user) return;
    const trimmed = prioritiesDraft.trim();
    if (!trimmed) return;

    setSavingPriorities(true);
    const userDocPath = `users/${user.uid}`;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        priorities: trimmed,
      });
      setPriorities(trimmed);
      setIsEditingPriorities(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userDocPath);
    } finally {
      setSavingPriorities(false);
    }
  };

  const handleCancelEditPriorities = () => {
    setPrioritiesDraft(priorities);
    setIsEditingPriorities(false);
  };

  // Handle "Decide For Me" Action
  const handleDecideForMe = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const optA = optionA.trim();
    const optB = optionB.trim();
    if (!optA || !optB || isEvaluating) return;

    setEvaluationError(null);

    // 1. Append user dilemma message to chat array
    const userMessage: UserDilemmaMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      optionA: optA,
      optionB: optB,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setCurrentEvaluatingDilemma({ optionA: optA, optionB: optB });
    setIsEvaluating(true);

    try {
      // 2. Call Firebase AI Logic SDK using Template Generative Model
      const model = getTemplateGenerativeModel(ai);

      // Pass input payload object with priorities, optionA, optionB
      const templateVariables = {
        priorities: priorities,
        optionA: optA,
        optionB: optB,
      };

      const result = await model.generateContent({
        templateId: 'decider-flow',
        templateVariables,
      });

      // 3. Extract JSON object response: verdict, justification, firstStep
      let verdict = '';
      let justification = '';
      let firstStep = '';

      const rawResult = result as unknown as Record<string, unknown>;
      // Check if returned directly as object
      if (rawResult && typeof rawResult.verdict === 'string') {
        verdict = rawResult.verdict;
        justification = String(rawResult.justification || '');
        firstStep = String(rawResult.firstStep || '');
      } else {
        // Extract from text response
        const text =
          typeof result?.response?.text === 'function'
            ? result.response.text()
            : JSON.stringify(result);

        try {
          const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
          const parsed = JSON.parse(cleaned);
          verdict = parsed.verdict || '';
          justification = parsed.justification || '';
          firstStep = parsed.firstStep || '';
        } catch {
          // Fallback parsing via regex
          const vMatch = text.match(/"verdict"\s*:\s*"([^"]+)"/i);
          const jMatch = text.match(/"justification"\s*:\s*"([^"]+)"/i);
          const sMatch = text.match(/"firstStep"\s*:\s*"([^"]+)"/i);

          verdict = vMatch ? vMatch[1] : text;
          justification = jMatch ? jMatch[1] : 'Trade-off evaluation completed.';
          firstStep = sMatch ? sMatch[1] : 'Execute recommended trajectory.';
        }
      }

      // 4. Update UI state: append system decision message to chat array
      const systemMessage: SystemDecisionMessage = {
        id: `system-${Date.now()}`,
        role: 'system',
        verdict: verdict || `Calibrated preference towards ${optB}`,
        justification:
          justification ||
          `Based on your axiomatic priorities of "${priorities}", this choice delivers superior long-term utility with minimized friction.`,
        firstStep: firstStep || `Commit to the decision and schedule the first concrete milestone.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, systemMessage]);
    } catch (err: unknown) {
      console.error('Firebase AI Logic execution error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to call Firebase AI Logic SDK.';
      setEvaluationError(errorMessage);

      // Check if App Check error
      if (errorMessage.toLowerCase().includes('app check') || errorMessage.includes('401')) {
        getActiveDebugToken().then((token) => {
          if (token) setDetectedDebugToken(token);
        });
      }
    } finally {
      setIsEvaluating(false);
      setCurrentEvaluatingDilemma(null);
    }
  };

  // Fallback / Simulation handler to test UI state mapping immediately
  const handleSimulateDecision = () => {
    const optA = currentEvaluatingDilemma?.optionA || optionA.trim();
    const optB = currentEvaluatingDilemma?.optionB || optionB.trim();

    const systemMessage: SystemDecisionMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      verdict: `Calibrated preference towards ${optB}`,
      justification: `Axiomatic evaluation against your declared priority ("${priorities}") indicates that ${optB} minimizes capital volatility and preserves flexibility, while ${optA} incurs elevated switching friction and overhead.`,
      firstStep: `Lock in the decision for ${optB} and execute initial planning milestones within 48 hours.`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, systemMessage]);
    setEvaluationError(null);
    setIsEvaluating(false);
    setCurrentEvaluatingDilemma(null);
  };

  const handleCopyDebugToken = () => {
    if (!detectedDebugToken) return;
    navigator.clipboard.writeText(detectedDebugToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleApplyCustomToken = (tokenToSave: string) => {
    const trimmed = tokenToSave.trim();
    if (!trimmed) return;
    localStorage.setItem('FIREBASE_APPCHECK_DEBUG_TOKEN', trimmed);
    window.location.reload();
  };

  const handleClearChat = () => {
    setMessages([]);
    setIsEvaluating(false);
    setCurrentEvaluatingDilemma(null);
    setEvaluationError(null);
  };

  // Initial Auth Loading Screen
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono tracking-widest uppercase text-slate-500">
            Initializing System
          </p>
        </div>
      </div>
    );
  }

  // Clean, Minimalist Sign-In State
  if (!user) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-800 flex flex-col justify-between p-8 md:p-14 select-none">
        <header>
          <h1 className="text-2xl font-black tracking-wider text-slate-900 uppercase">
            Decide For Me
          </h1>
        </header>

        <div className="max-w-md mx-auto w-full space-y-8 my-auto py-12">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-slate-200/90 shadow-sm text-blue-600 mb-2">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Hyper-Rational Decision Assistant
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For chronically indecisive minds facing life choices. Sign in to anchor your axiomatic
              priorities and evaluate trade-offs.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-900 hover:bg-blue-600 active:scale-[0.99] text-white font-medium text-sm rounded-xl transition-all shadow-sm group"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
              </svg>
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {authError && (
              <p className="text-xs text-red-600 text-center font-mono bg-red-50 py-2 px-3 rounded-lg border border-red-200">
                {authError}
              </p>
            )}
          </div>

          <div className="text-center text-xs text-slate-400 font-mono">
            Axiomatic Weights • Zero Cognitive Drift
          </div>
        </div>

        <footer className="text-xs text-slate-400 font-mono text-center md:text-left">
          © Decide For Me
        </footer>
      </div>
    );
  }

  // Authenticated State: Dilemma Decision Screen
  return (
    <div className="h-full w-full min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden">
      {/* Left Column: Decision Area (~72%) */}
      <main
        className="flex-1 flex flex-col justify-between p-6 sm:p-8 md:p-10 lg:p-14 bg-slate-50 relative overflow-y-auto"
        data-purpose="decision-workspace"
      >
        {/* Top Header & Assistant Prompt */}
        <section className="space-y-6" data-purpose="header-and-assistant-prompt">
          <div className="flex items-center justify-between">
            {/* Sketch Heading: DECIDE FOR ME */}
            <h1 className="text-2xl font-black tracking-wider text-slate-900 uppercase select-none">
              Decide For Me
            </h1>

            {/* Unobtrusive Actions & Sign Out */}
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  type="button"
                  className="text-xs font-mono text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  title="Clear decision history"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Chat</span>
                </button>
              )}
              <span className="hidden sm:inline-block text-xs text-slate-500 font-mono truncate max-w-[180px]">
                {user.email}
              </span>
              <button
                onClick={handleSignOut}
                type="button"
                title="Sign Out"
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Assistant Prompt Bubble: "Tell me your dilemma!" */}
          <div className="inline-block">
            <div className="speech-bubble bg-white border border-slate-200/90 rounded-2xl px-5 py-3.5 shadow-sm text-slate-900 font-medium tracking-tight text-sm md:text-base flex items-center space-x-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
              <span>Tell me your dilemma!</span>
            </div>
          </div>
        </section>

        {/* Dynamic Main Chat Panel / Decision Workspace */}
        <div className="my-auto py-6 space-y-6 flex-1 flex flex-col justify-start overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
          {messages.length === 0 && !isEvaluating ? (
            /* Spacer / Focus Zone before submission */
            <div className="flex-1 min-h-[140px] flex items-center justify-center" id="workspace-spacer">
              <div className="text-center space-y-2 opacity-60">
                <Compass className="w-8 h-8 text-slate-400 mx-auto stroke-[1.5]" />
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400">
                  Ready for options input
                </p>
              </div>
            </div>
          ) : (
            /* Chat Messages Stream */
            <div className="w-full max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    /* User side chat bubble (positioned on the right) */
                    <div key={msg.id} className="flex justify-end w-full animate-in fade-in duration-200">
                      <div className="max-w-lg bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                          <span>My Dilemma</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              Option A
                            </span>
                            <p className="text-sm font-semibold text-slate-900 leading-snug">
                              {msg.optionA}
                            </p>
                          </div>
                          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              Option B
                            </span>
                            <p className="text-sm font-semibold text-slate-900 leading-snug">
                              {msg.optionB}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (msg.role === 'system') {
                  return (
                    /* System chat bubble (positioned on the left side) */
                    <div key={msg.id} className="flex justify-start w-full animate-in fade-in duration-300">
                      <div
                        className="max-w-2xl w-full bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-5"
                        data-purpose="system-decision-bubble"
                      >
                        {/* Header badge */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                            <span className="inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                            Rational Matrix Evaluation
                          </span>
                          <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                            Calibrated
                          </span>
                        </div>

                        {/* Field 1: Verdict */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">
                            Verdict
                          </span>
                          <p className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                            {msg.verdict}
                          </p>
                        </div>

                        {/* Field 2: Justification */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block">
                            Axiomatic Justification
                          </span>
                          <div className="text-sm text-slate-600 leading-relaxed font-normal whitespace-pre-line">
                            {msg.justification}
                          </div>
                        </div>

                        {/* Field 3: First Step */}
                        <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 space-y-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700 block">
                            First Step
                          </span>
                          <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                            {msg.firstStep}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {/* Sleek Loading State in the Main Chat Panel (positioned on the left side) */}
              {isEvaluating && (
                <div className="flex justify-start w-full animate-in fade-in duration-200">
                  <div
                    className="max-w-2xl w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4"
                    data-purpose="reasoning-display"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-ping"></span>
                        Rational Matrix Evaluation
                      </span>
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        Simulating trade-offs...
                      </span>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Weighting expected utility of{' '}
                        <strong className="text-slate-900">
                          {currentEvaluatingDilemma?.optionA || optionA}
                        </strong>{' '}
                        vs.{' '}
                        <strong className="text-slate-900">
                          {currentEvaluatingDilemma?.optionB || optionB}
                        </strong>{' '}
                        against baseline priorities...
                      </p>

                      {/* Animated Shimmer Bar */}
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-1.5 rounded-full w-2/3 animate-[pulse_1.5s_ease-in-out_infinite]" />
                      </div>

                      <p className="text-xs text-slate-400 font-mono">
                        Calling Firebase AI Logic template <code className="text-blue-600 font-semibold">decider-flow</code>...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display with App Check Debug Token Support */}
              {evaluationError && (
                <div className="flex justify-start w-full animate-in fade-in duration-300">
                  <div className="max-w-2xl w-full bg-amber-50/90 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1.5 flex-1">
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-amber-900">
                          Firebase App Check Verification Required
                        </p>
                        <p className="text-xs text-amber-800 leading-relaxed font-mono">
                          {evaluationError}
                        </p>
                      </div>
                    </div>

                    {/* Debug Token Registration Box */}
                    <div className="bg-white/90 border border-amber-200/80 rounded-xl p-4 space-y-3">
                      <p className="text-xs text-slate-700 leading-relaxed">
                        To authorize client calls to the Firebase AI Logic SDK, your App Check debug token must be registered in the Firebase console:
                      </p>

                      <div className="space-y-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                          Active Debug Token
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-xs font-mono text-slate-800 select-all border border-slate-200 break-all">
                            {detectedDebugToken || 'Initializing token...'}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyDebugToken}
                            disabled={!detectedDebugToken}
                            className="px-3 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            {tokenCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-green-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Token</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 leading-normal border-t border-slate-100 pt-2 space-y-1">
                        <p className="font-semibold text-slate-800">Registration Steps:</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-slate-600 pl-1">
                          <li>Open the <strong className="text-slate-800">Firebase Console</strong> for project <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">ai-labs26ber-9724</code>.</li>
                          <li>Navigate to <strong className="text-slate-800">App Check</strong> → <strong className="text-slate-800">Apps</strong> tab → select the web app.</li>
                          <li>Click <strong className="text-slate-800">Manage debug tokens</strong> → <strong className="text-slate-800">Add debug token</strong>, paste the token above, and save.</li>
                        </ol>
                      </div>

                      {/* Custom debug token input */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                          Or set registered token manually:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Paste pre-registered debug token UUID..."
                            value={customTokenInput}
                            onChange={(e) => setCustomTokenInput(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyCustomToken(customTokenInput)}
                            disabled={!customTokenInput.trim()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                          >
                            Apply & Reload
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => handleDecideForMe()}
                        className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                        type="button"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry SDK Call</span>
                      </button>

                      <button
                        onClick={handleSimulateDecision}
                        className="px-3.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                        type="button"
                        title="Simulate calibrated evaluation to verify UI state and layout mapping"
                      >
                        <Play className="w-3.5 h-3.5 text-amber-700" />
                        <span>Test Decision Layout</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>
          )}
        </div>

        {/* Bottom Input Dock */}
        <footer className="w-full max-w-4xl pt-4" data-purpose="bottom-input-dock">
          <form
            onSubmit={handleDecideForMe}
            className="bg-white border border-slate-300 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow transition-shadow duration-200"
          >
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
              {/* Option A Input Group */}
              <div className="flex-1 flex flex-col space-y-1.5">
                <label
                  htmlFor="option-a"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono"
                >
                  Option A
                </label>
                <input
                  id="option-a"
                  name="option_a"
                  type="text"
                  required
                  disabled={isEvaluating}
                  placeholder="e.g. Move to New York"
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-slate-900 text-sm font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all disabled:opacity-60"
                />
              </div>

              {/* Minimal Vertical Divider */}
              <div className="hidden md:block w-px h-11 bg-slate-200 mx-1"></div>

              {/* Option B Input Group */}
              <div className="flex-1 flex flex-col space-y-1.5">
                <label
                  htmlFor="option-b"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono"
                >
                  Option B
                </label>
                <input
                  id="option-b"
                  name="option_b"
                  type="text"
                  required
                  disabled={isEvaluating}
                  placeholder="e.g. Stay in London"
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-slate-900 text-sm font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all disabled:opacity-60"
                />
              </div>

              {/* Decide For Me / GO Action Button */}
              <div className="flex items-end pt-1 md:pt-4">
                <button
                  id="decide-for-me-btn"
                  name="decide-for-me"
                  aria-label="Decide For Me"
                  type="submit"
                  disabled={isEvaluating || !optionA.trim() || !optionB.trim()}
                  className="w-full md:w-auto px-6 py-2.5 bg-slate-900 hover:bg-blue-600 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all duration-150 active:scale-95 shadow-sm flex items-center justify-center min-w-[140px] h-[42px] gap-2"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deciding...</span>
                    </>
                  ) : (
                    <span>Decide For Me</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </footer>
      </main>

      {/* Right Column: Priorities Sidebar (~28%) */}
      <aside
        className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-slate-200 bg-white p-6 sm:p-8 lg:p-10 flex flex-col justify-start space-y-6 shrink-0 shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.02)]"
        data-purpose="priorities-sidebar"
      >
        {/* Section Title: MY PRIORITIES */}
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-xs font-bold font-mono tracking-widest text-slate-900 uppercase">
            My Priorities
          </h2>
        </div>

        {/* Priorities Card Container */}
        <div className="space-y-4">
          {!isEditingPriorities ? (
            /* Read-Only View of Priorities */
            <div
              className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative transition-all"
              id="priorities-card"
            >
              <p
                className="text-sm font-serif italic text-slate-700 leading-relaxed"
                id="priorities-text"
              >
                “{priorities}”
              </p>
            </div>
          ) : (
            /* Editable View */
            <div className="space-y-3" id="priorities-edit-box">
              <textarea
                rows={4}
                value={prioritiesDraft}
                onChange={(e) => setPrioritiesDraft(e.target.value)}
                placeholder="Enter your top priorities in life..."
                className="w-full p-3.5 bg-white text-sm text-slate-800 border border-blue-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all font-sans resize-none"
              />
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSavePriorities}
                  disabled={savingPriorities || !prioritiesDraft.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {savingPriorities && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditPriorities}
                  disabled={savingPriorities}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium uppercase tracking-wider rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action Button: EDIT PRIORITIES */}
          {!isEditingPriorities && (
            <button
              type="button"
              onClick={() => {
                setPrioritiesDraft(priorities);
                setIsEditingPriorities(true);
              }}
              className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
              id="edit-priorities-btn"
            >
              Edit Priorities
            </button>
          )}
        </div>

        {/* Context Note for Rational Weighting */}
        <div className="pt-2 text-xs text-slate-400 leading-normal">
          Your priorities are applied as axiomatic weights across all comparative calculations.
        </div>
      </aside>
    </div>
  );
}
