// Everything the assistant knows about you. It is told to answer ONLY from this,
// so if something is missing here it will say "Ahmed will confirm" instead of guessing.
// Edit freely, then redeploy with `npx wrangler deploy`.

export const ABOUT = `
Name: Ahmed Mohamed Eldegla
Role: Backend Developer (.NET & C++)
Location: Mansoura, Egypt
Languages: Arabic (native), English (good)

Summary: Backend developer with 7+ years of overall software development experience: 1+ year building ASP.NET Core APIs and 7 years as a freelance C++ engineer in real-time networking, debugging and performance optimization. Builds RESTful APIs with ASP.NET Core 8, Entity Framework Core and SQL Server, following Clean Architecture and CQRS. Main contributor to a multi-module freelance marketplace API built in a 5-person team at DEPI.

Skills:
- Backend: C#, ASP.NET Core Web API (.NET 8), RESTful APIs, Entity Framework Core, LINQ, MediatR, AutoMapper, FluentValidation
- Architecture: Clean Architecture, CQRS, Repository Pattern, Result Pattern, Domain Events, Dependency Injection, SOLID, OOP
- Security: JWT authentication, ASP.NET Core Identity, role & permission-based authorization, rate limiting
- Databases: SQL Server, T-SQL, EF Core Migrations, database design & relationships
- Systems: C++, multithreading, data structures & algorithms, real-time networking, debugging, performance optimization
- Tools: Git, GitHub, GitHub Actions, Swagger / OpenAPI, Visual Studio, SSMS

Projects:
1. DEPI Smart Freelance Platform, backend API (team of 5, 2026). Stack: ASP.NET Core 8, EF Core, SQL Server, MediatR, JWT, Identity, AutoMapper, FluentValidation, Swagger. Source: https://github.com/AhmedEldegla/Depi
   - Built the backend of a freelance marketplace (projects, proposals, milestone contracts, escrow wallets, messaging, reviews, guilds, communities) as the team's top contributor and repository owner.
   - 4 layers (Domain, Application, Infrastructure, API) with Clean Architecture and CQRS via MediatR; 85+ REST endpoints across 17 controllers.
   - Authentication and authorization with ASP.NET Core Identity and JWT, including role/permission management and user sessions.
   - SQL Server data model with EF Core; fixed shadow foreign-key mapping issues; delivered SQL scripts and backups for the data analysis team.
   - Global exception-handling middleware, MediatR logging behaviors, request validation, rate limiting, health checks; GitHub Actions workflows for team notifications.
2. Mo7amek: management system for law offices (cases, clients, appointments, office workflows). .NET API + SQL Server. Private repo; walkthrough on request.
3. Cashier POS System: point-of-sale backend for cashier workflows, sales operations and business data. .NET API + SQL Server. Private repo; walkthrough on request.
4. Smart Accountant: dashboard for accounting workflows and business overviews. Private repo; walkthrough on request.

Work experience:
- C++ Networking Developer, freelance (2024-2025): built high-performance C++ packet inspection and filtering tools for online multiplayer games, processing live network traffic under strict real-time constraints; profiled, debugged and optimized multithreaded networking code for stability and low latency.
- C++ Game Systems Developer, freelance (2017-2023): developed C++ extensions for real-time game clients using static and dynamic binary analysis; diagnosed complex crashes and memory issues with runtime debuggers and memory analysis tools.

Training: Digital Egypt Pioneers Initiative (DEPI), .NET Full Stack Track (2025-2026), Ministry of Communications and Information Technology (MCIT), Mansoura. Intensive training in C#, ASP.NET Core, EF Core, SQL Server and software architecture.

Education: Bachelor of Commerce, Business Administration, Mansoura University (2017-2021).

Links:
- Email: ahmeddagla99@gmail.com
- GitHub: https://github.com/AhmedEldegla
- LinkedIn: https://www.linkedin.com/in/ahmed-eldegla-2a751b184/
- Resume: https://drive.google.com/file/d/1ERP4TigKxlr0o9qqvx4J5W_ZBx4k4BEQ/view?usp=sharing
`;

// Optional business details. Leave a field as "" and the assistant will say
// Ahmed will confirm it personally instead of making something up.
export const DETAILS = {
  availability: "",   // e.g. "Available for freelance and full-time roles from October 2026"
  workType: "",       // e.g. "Remote worldwide, or on-site in Cairo"
  timezone: "Cairo (Africa/Cairo)",
  services: "",       // e.g. "REST APIs in ASP.NET Core, database design, performance fixes for existing .NET apps"
  rates: "",          // e.g. "Project-based; share scope for a quote"  (leave empty to never discuss price)
  responseTime: ""    // e.g. "Usually replies within 24 hours"
};
