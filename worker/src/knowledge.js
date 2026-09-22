// Everything the assistant knows about you. It is told to answer ONLY from this,
// so if something is missing here it will say "Ahmed will confirm" instead of guessing.
// Edit freely, then redeploy with `npx wrangler deploy`.

export const ABOUT = `
Name: Ahmed Eldegla
Role: .NET Backend Developer (C#, .NET, Entity Framework, LINQ, SQL Server, RESTful APIs)
Background: 8+ years of C++ before .NET: real-time networking, game systems, low-level debugging, performance optimization.

Experience:
- Backend .NET Development (2026): C#, .NET, LINQ, Entity Framework; data modeling, database access, RESTful API design, layered architecture, Git/GitHub team workflow.
- C++ Networking & Game Security Developer, freelance (2024-2025): designed and built high-performance C++ packet-filtering systems for online games, inspecting and transforming live traffic in real time; owned latency-sensitive networking logic with a focus on stability and optimization.
- C++ Game Developer, freelance (2017-2023): low-level C++ game modifications using static and dynamic analysis of binaries; runtime debugging, memory analysis, performance tuning.

Projects:
1. Depi Freelance Platform (graduation project): freelance marketplace connecting clients and freelancers. Source: https://github.com/AhmedEldegla/Depi
2. Mo7amek: management system for law offices (cases, clients, appointments, office workflows). .NET API + SQL Server. Private repo; walkthrough on request.
3. Cashier POS System: point-of-sale backend for cashier workflows, sales operations, and business data. .NET API + SQL Server. Private repo; walkthrough on request.
4. Smart Accountant: dashboard for accounting workflows and business overviews. Private repo; walkthrough on request.

Skills: C#, .NET, ASP.NET Web API, Entity Framework, LINQ, RESTful APIs, SQL Server, SQL, data modeling, C++, real-time networking, packet processing, performance optimization, debugging, memory analysis, reverse engineering, data structures & algorithms, Git & GitHub.

Links:
- Email: ahmeddagla99@gmail.com
- GitHub: https://github.com/AhmedEldegla
- LinkedIn: https://www.linkedin.com/in/ahmed-eldegla-2a751b184/
- Resume: https://drive.google.com/file/d/1imcQniBaoirsrv8QieigPCbmeR8H5mB7/view?usp=sharing
`;

// Optional business details. Leave a field as "" and the assistant will say
// Ahmed will confirm it personally instead of making something up.
export const DETAILS = {
  availability: "",   // e.g. "Available for freelance and full-time roles from October 2026"
  workType: "",       // e.g. "Remote worldwide, or on-site in Cairo"
  timezone: "",       // e.g. "Cairo (UTC+3)"
  services: "",       // e.g. "REST APIs in ASP.NET Core, database design, performance fixes for existing .NET apps"
  rates: "",          // e.g. "Project-based; share scope for a quote"  (leave empty to never discuss price)
  responseTime: ""    // e.g. "Usually replies within 24 hours"
};
