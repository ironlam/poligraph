"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { Send, User, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { SUGGESTED_QUESTIONS, AUTOCOMPLETE_COMPLETIONS, type Message } from "./chatConfig";
import { ChatMessageContent } from "./ChatMessageContent";

export function ChatInterface() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [ghostText, setGhostText] = useState<string | null>(null);
  // Scroll within chat container only (not page)
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Scroll to bottom only when user sends a new message
  const scrollOnNewUserMessage = useRef(false);

  useEffect(() => {
    if (scrollOnNewUserMessage.current) {
      scrollToBottom();
      scrollOnNewUserMessage.current = false;
    }
  }, [messages, scrollToBottom]);

  // Rate limit countdown
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setTimeout(() => {
        setRetryAfter((r) => r - 1);
        if (retryAfter === 1) {
          setIsRateLimited(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [retryAfter]);

  // Ghost text autocomplete - find completion that starts with user input
  useEffect(() => {
    if (input.length < 3) {
      setGhostText(null);
      return;
    }

    const lowerInput = input.toLowerCase().trim();

    // Find the best matching completion
    let bestMatch: string | null = null;

    // First, try exact prefix match in completions
    for (const [trigger, completion] of Object.entries(AUTOCOMPLETE_COMPLETIONS)) {
      if (lowerInput === trigger || lowerInput.startsWith(trigger + " ")) {
        // Check if completion starts with what user typed (case insensitive)
        if (completion.toLowerCase().startsWith(lowerInput)) {
          bestMatch = completion;
          break;
        }
        // Otherwise use the completion as suggestion
        bestMatch = completion;
        break;
      }
      // Partial trigger match
      if (trigger.startsWith(lowerInput) && !bestMatch) {
        bestMatch = completion;
      }
    }

    // Only show ghost if it's different and extends the input
    if (
      bestMatch &&
      bestMatch.toLowerCase() !== lowerInput &&
      bestMatch.toLowerCase().startsWith(lowerInput)
    ) {
      setGhostText(bestMatch);
    } else {
      setGhostText(null);
    }
  }, [input]);

  const sendMessage = useCallback(
    async (messageContent: string) => {
      if (!messageContent.trim() || isLoading) return;

      setError(null);
      setIsLoading(true);
      scrollOnNewUserMessage.current = true;

      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageContent,
      };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      // Reset textarea height after sending
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      // Prepare assistant message placeholder
      const assistantId = `assistant-${Date.now()}`;
      setMessages([...newMessages, { id: assistantId, role: "assistant", content: "" }]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (response.status === 429) {
          setIsRateLimited(true);
          const data = await response.json();
          setRetryAfter(data.retryAfter || 60);
          setMessages(newMessages); // Remove assistant placeholder
          throw new Error("Trop de requêtes");
        }

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Une erreur s'est produite");
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("Streaming non supporté");
        }

        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

          // Update message content
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m))
          );
        }

        // Safety net: server injects error text on API failure, but guards against
        // edge cases where stream is empty (e.g., proxy stripping response body)
        if (!assistantContent.trim()) {
          throw new Error(
            "L'assistant est temporairement indisponible. Veuillez réessayer plus tard."
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Erreur inconnue"));
        // Remove the empty assistant message on error
        setMessages(newMessages);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab to accept ghost text completion
    if (e.key === "Tab" && ghostText) {
      e.preventDefault();
      setInput(ghostText);
      setGhostText(null);
      return;
    }

    // Escape to dismiss ghost text
    if (e.key === "Escape" && ghostText) {
      setGhostText(null);
      return;
    }

    // Send message on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Handle suggested question click — sends immediately
  const handleSuggestedQuestion = (question: string) => {
    setGhostText(null);
    sendMessage(question);
  };

  // Retry last message
  const handleRetry = () => {
    if (messages.length === 0) return;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      // Remove all messages after the last user message
      const lastUserIndex = messages.lastIndexOf(lastUserMessage);
      setMessages(messages.slice(0, lastUserIndex));
      sendMessage(lastUserMessage.content);
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh]">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <Logo size={64} />
            <div>
              <h2 className="text-xl font-semibold mb-2">Assistant Poligraph</h2>
              <p className="text-muted-foreground max-w-md">
                Posez vos questions sur la politique française : élus, votes, affaires judiciaires,
                patrimoine, institutions ou dossiers législatifs.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {SUGGESTED_QUESTIONS.map((question, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="text-left h-auto py-2.5 px-4 justify-start whitespace-normal"
                  onClick={() => handleSuggestedQuestion(question)}
                >
                  <span className="text-sm">{question}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && <Logo size={32} />}
                <Card
                  className={cn(
                    "max-w-[80%] py-3 overflow-hidden",
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  <CardContent className="p-0 px-4 overflow-hidden">
                    <div
                      className={cn(
                        "prose prose-sm max-w-none break-words overflow-wrap-anywhere",
                        message.role === "user" && "prose-invert"
                      )}
                    >
                      {message.role === "assistant" ? (
                        message.content ? (
                          <ChatMessageContent content={message.content} />
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Recherche en cours...</span>
                          </div>
                        )
                      ) : (
                        <p className="m-0 whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {/* Error display */}
            {error && !isRateLimited && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                </div>
                <Card className="bg-destructive/10 border-destructive/20 py-3">
                  <CardContent className="p-0 px-4">
                    <p className="text-sm text-destructive mb-2">
                      {error.message || "Une erreur s'est produite. Veuillez réessayer."}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                      <RefreshCw className="w-3 h-3" />
                      Réessayer
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Rate limit warning */}
            {isRateLimited && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                </div>
                <Card className="bg-orange-500/10 border-orange-500/20 py-3">
                  <CardContent className="p-0 px-4">
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Trop de requêtes. Veuillez patienter{" "}
                      {retryAfter > 0 ? `${retryAfter}s` : "quelques instants"}.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            {/* Ghost text overlay */}
            {ghostText && (
              <div
                className="absolute inset-0 px-4 py-3 pointer-events-none overflow-hidden"
                aria-hidden="true"
              >
                <span className="invisible">{input}</span>
                <span className="text-muted-foreground/50">{ghostText.slice(input.length)}</span>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea to fit content
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question..."
              disabled={isLoading || isRateLimited}
              rows={1}
              className={cn(
                "w-full resize-none rounded-lg border bg-transparent px-4 py-3",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "min-h-[48px] max-h-[120px] overflow-y-auto"
              )}
            />
            {/* Tab hint */}
            {ghostText && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Tab ↹
              </div>
            )}
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim() || isRateLimited}
            size="icon"
            className="h-12 w-12 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span className="sr-only">Envoyer</span>
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Les réponses sont basées sur notre base de données.{" "}
          <a href="/sources" className="underline hover:text-foreground">
            En savoir plus sur nos sources
          </a>
        </p>
      </div>
    </div>
  );
}
