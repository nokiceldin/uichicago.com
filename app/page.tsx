import Link from "next/link";
import HeroSearchBar from "./components/HeroSearchBar";

export default function Home() {
  const capabilities = [
    { emoji: "📊", title: "Grades & Courses", desc: "Real GPA data and A-rates for every UIC course across 5+ semesters" },
    { emoji: "👨‍🏫", title: "Professor Rankings", desc: "RMP ratings + grade data for 1,275 UIC professors" },
    { emoji: "💰", title: "Tuition & Aid", desc: "Costs, Aspire Grant, scholarships, and financial aid details" },
    { emoji: "🏠", title: "Housing & Dining", desc: "All 10 dorms with costs, meal plans, and every dining spot" },
    { emoji: "🎉", title: "Student Life", desc: "460+ orgs, Greek life, Spark festival, Weeks of Welcome" },
    { emoji: "🏀", title: "Flames Athletics", desc: "All teams, coaches, rosters, free student tickets info" },
    { emoji: "🗺️", title: "Campus & Transit", desc: "Buildings, CTA routes, shuttles, parking, offices" },
    { emoji: "🏥", title: "Health & Wellness", desc: "Counseling, health clinic, rec center, career services" },
  ];

  const examples = [
    { q: "Which CS 211 professor gives the best grades?", tag: "Grades" },
    { q: "Do I qualify for the Aspire Grant?", tag: "Financial Aid" },
    { q: "Which dorm should I pick as a freshman?", tag: "Housing" },
    { q: "Who is on the UIC men's basketball roster?", tag: "Athletics" },
    { q: "Where is the Financial Aid office?", tag: "Campus" },
    { q: "What student orgs exist for pre-med students?", tag: "Student Life" },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 blur-[120px] rounded-full" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600/30 rounded-full px-4 py-1.5 text-red-400 text-sm font-medium mb-8">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            UIC STUDENTS ONLY
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-none mb-6">
            Your AI guide
            <br />
            <span className="text-red-500">for all of UIC.</span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Grades, professors, housing, dining, athletics, campus life — Sparky knows everything about UIC and answers instantly.
          </p>

          <HeroSearchBar />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-zinc-800 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-zinc-800">
          {[
            { n: "2,696", l: "Courses indexed" },
            { n: "1,275", l: "Professors rated" },
            { n: "10", l: "Residence halls" },
            { n: "460+", l: "Student orgs" },
          ].map(s => (
            <div key={s.l} className="text-center py-4 px-6">
              <div className="text-2xl font-black text-white">{s.n}</div>
              <div className="text-xs text-zinc-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities grid */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black mb-3">Everything about UIC</h2>
            <p className="text-zinc-500">One place to ask anything</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {capabilities.map(c => (
              <Link
                key={c.title}
                href="/chat"
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-5 transition-all hover:bg-zinc-800/50 group"
              >
                <div className="text-2xl mb-3">{c.emoji}</div>
                <div className="font-bold text-sm mb-1 group-hover:text-red-400 transition-colors">{c.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{c.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Example questions */}
      <section className="py-20 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black mb-3">Try asking Sparky</h2>
            <p className="text-zinc-500">Real questions, real answers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {examples.map(e => (
              <Link
                key={e.q}
                href={`/chat?q=${encodeURIComponent(e.q)}`}
                className="flex items-start gap-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-red-600/50 rounded-2xl p-5 text-left transition-all group"
              >
                <span className="text-xs font-bold bg-red-600/20 text-red-400 border border-red-600/30 px-2 py-0.5 rounded-full shrink-0 mt-0.5">{e.tag}</span>
                <span className="text-sm text-zinc-300 group-hover:text-white transition-colors leading-relaxed">"{e.q}"</span>
              </Link>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg"
            >
              🐉 Chat with Sparky
            </Link>
          </div>
        </div>
      </section>

      {/* Mock convo */}
      <section className="py-20 px-6 border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black mb-3">See Sparky in action</h2>
            <p className="text-zinc-500">Real answers from real data</p>
          </div>
          <div className="space-y-4">
            {[
              { role: "user", text: "Which dorm should I pick as a freshman?" },
              { role: "sparky", text: "For freshmen, **ARC** and **JST** are the two best picks.\n\n**ARC** (940 W Harrison) is the most modern building — it has a fitness center inside, study lounges on every floor, and a 10th floor sky lounge. Shared rooms run ~$6,342/semester.\n\n**JST** (James Stukel Towers) has a dining hall literally inside the building, suite-style rooms, and the most Living Learning Community options of any dorm. Shared suites run ~$6,181/semester.\n\nBoth require a meal plan. If price matters, **CMW** shared rooms are the cheapest at ~$5,275/semester." },
              { role: "user", text: "Who gives the best grades in MATH 160?" },
              { role: "sparky", text: "Based on grade data across all semesters, **Shavila Devi** leads MATH 160 instructors with an avg GPA of **3.41** and a **52.1% A-rate** — ranked #1 of the instructors who've taught the course. The course overall averages a **2.89 GPA** (Medium difficulty), so picking the right section really matters here." },
            ].map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "sparky" && (
                  <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-sm shrink-0 mt-1">🐉</div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${msg.role === "user" ? "bg-red-600 text-white rounded-tr-sm" : "bg-zinc-800 text-zinc-200 rounded-tl-sm"}`}
                  dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-10 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-sm">
          <div className="flex items-center gap-2 font-bold text-white">
            <span className="text-red-500 text-xl">🔥</span> UIC SPARKY
          </div>
          <div className="text-center">Powered by real grade data · uicratings@gmail.com</div>
          <div className="text-xs">Not affiliated with UIC or RateMyProfessors</div>
        </div>
      </footer>
    </main>
  );
}