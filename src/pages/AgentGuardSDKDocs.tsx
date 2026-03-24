import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowLeft, Copy, Check, Code, Terminal, BookOpen, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

const codeExamples = {
  python: {
    label: "Python",
    install: "pip install agentguard-sdk",
    code: `from agentguard import AgentGuard

# Initialize with your API key
guard = AgentGuard(
    api_key="your-agentguard-key",
    agent_id="your-agent-id"
)

# Wrap your agent's API calls
@guard.monitor
def call_openai(prompt):
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    return response

# Set cost limits
guard.set_limits(
    max_cost_per_task=2.00,
    max_api_calls_per_min=50,
    max_reasoning_steps=25
)

# Log custom actions
guard.log_action(
    action_type="tool_call",
    provider="openai",
    model="gpt-4",
    cost=0.03,
    input_tokens=150,
    output_tokens=80
)`,
  },
  javascript: {
    label: "JavaScript",
    install: "npm install @agentguard/sdk",
    code: `import { AgentGuard } from '@agentguard/sdk';

// Initialize
const guard = new AgentGuard({
  apiKey: 'your-agentguard-key',
  agentId: 'your-agent-id',
});

// Monitor API calls
const response = await guard.monitor(async () => {
  return await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
});

// Set limits
guard.setLimits({
  maxCostPerTask: 2.00,
  maxApiCallsPerMin: 50,
  maxReasoningSteps: 25,
});

// Log custom actions
await guard.logAction({
  actionType: 'tool_call',
  provider: 'openai',
  model: 'gpt-4',
  cost: 0.03,
  inputTokens: 150,
  outputTokens: 80,
});`,
  },
  langchain: {
    label: "LangChain",
    install: "pip install agentguard-langchain",
    code: `from agentguard.integrations import LangChainCallback
from langchain.agents import AgentExecutor

# Add AgentGuard as a callback
guard_callback = LangChainCallback(
    api_key="your-agentguard-key",
    agent_id="your-agent-id"
)

# Attach to your agent
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[guard_callback],
    max_iterations=25  # synced with AgentGuard limits
)

# Run - costs and actions are tracked automatically
result = agent_executor.invoke({
    "input": "Research and summarize AI trends"
})`,
  },
  crewai: {
    label: "CrewAI",
    install: "pip install agentguard-crewai",
    code: `from agentguard.integrations import CrewAIMonitor
from crewai import Crew, Agent, Task

# Initialize monitor
monitor = CrewAIMonitor(
    api_key="your-agentguard-key"
)

# Create agents with monitoring
researcher = Agent(
    role="Researcher",
    goal="Find information",
    backstory="Expert researcher",
    callbacks=[monitor.callback("researcher-agent-id")]
)

# Run crew with monitoring
crew = Crew(
    agents=[researcher],
    tasks=[task],
    callbacks=[monitor.crew_callback()]
)

result = crew.kickoff()

# View stats
print(monitor.get_summary())
# {'total_cost': 0.42, 'api_calls': 15, ...}`,
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-status-healthy" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AgentGuardSDKDocs() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<keyof typeof codeExamples>("python");

  const example = codeExamples[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/agentguard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold font-serif text-foreground">
            Agent<span className="text-primary">Guard</span> <span className="text-muted-foreground font-normal">SDK Docs</span>
          </h1>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <BookOpen className="w-3.5 h-3.5" />
            SDK Documentation
          </div>
          <h2 className="text-4xl font-bold font-serif text-foreground mb-4">Integrate in 5 Minutes</h2>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Add monitoring, cost tracking, and security to your AI agents with just a few lines of code.
          </p>
        </motion.div>

        {/* Quick start steps */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-12">
          <h3 className="text-xl font-semibold font-serif text-foreground mb-6">Quick Start</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Create an Agent", desc: "Add an agent in the dashboard and get your agent ID." },
              { step: "2", title: "Install SDK", desc: "Install the SDK for your language or framework." },
              { step: "3", title: "Monitor", desc: "Wrap your API calls and set cost limits." },
            ].map((s) => (
              <div key={s.step} className="glass-card rounded-xl p-5 border border-border">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary font-bold text-sm mb-3">
                  {s.step}
                </span>
                <h4 className="font-semibold text-foreground mb-1">{s.title}</h4>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Code examples */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="text-xl font-semibold font-serif text-foreground mb-6">Code Examples</h3>
          
          {/* Language tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(Object.keys(codeExamples) as Array<keyof typeof codeExamples>).map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === key
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {codeExamples[key].label}
              </button>
            ))}
          </div>

          {/* Install command */}
          <div className="glass-card rounded-xl p-4 border border-border mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Terminal className="w-3.5 h-3.5" />
                Install
              </div>
              <CopyButton text={example.install} />
            </div>
            <code className="text-sm font-mono text-primary">{example.install}</code>
          </div>

          {/* Code block */}
          <div className="glass-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Code className="w-3.5 h-3.5" />
                {example.label} Example
              </div>
              <CopyButton text={example.code} />
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-muted-foreground">{example.code}</code>
            </pre>
          </div>
        </motion.div>

        {/* Features list */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-12">
          <h3 className="text-xl font-semibold font-serif text-foreground mb-6">What the SDK Tracks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: Zap, label: "API call monitoring", desc: "Every LLM call is logged with latency, tokens, and cost" },
              { icon: Shield, label: "Key leak prevention", desc: "Scans prompts and logs for exposed credentials" },
              { icon: Code, label: "Loop detection", desc: "Detects repeated actions and auto-pauses runaway agents" },
              { icon: Terminal, label: "Cost enforcement", desc: "Hard limits on spending per task, per minute, per agent" },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-3 glass-card rounded-xl p-4 border border-border">
                <f.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-foreground text-sm">{f.label}</h4>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
