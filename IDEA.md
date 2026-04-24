Below is a clean product plan you can give to a technical agent to generate the tech spec.

# Hackathon idea: PreCall

## One-liner

**PreCall is a voice-first meeting prep agent that looks at your upcoming meetings, reads your relevant Notion notes, researches the company/person online, and gives you a tactical briefing before the call.**

## Core idea

The app helps users prepare for meetings without manually searching across calendar events, notes, websites, and past context.

The user should be able to open the app, see their next meetings, click **Brief me**, and get a useful meeting briefing in less than a minute.

The final experience should feel simple:

```text
1. Connect calendar
2. See upcoming meetings
3. Pick a meeting
4. Select or auto-detect relevant Notion context
5. Generate a briefing
6. Ask follow-up questions by voice
```

The product should feel like:

> “Before every meeting, I can instantly know who I’m talking to, what the company does, what I already know from my notes, what to ask, and how to open the conversation.”

## Why this fits the hackathon

The hackathon rewards projects that use multiple sponsor tools effectively and ship something real. This idea is strong because every sponsor has a clear role and the product is demoable.

The project is not a random AI wrapper. It is a focused workflow:

```text
Upcoming meeting
→ private context
→ public research
→ tactical briefing
→ voice Q&A
```

The goal is to keep the app simple, but make the demo feel magical.

## Main user workflow

### 1. User lands on the dashboard

The dashboard shows:

```text
Upcoming meetings
Recently generated briefings
Create briefing manually
```

The main UI should focus on the next few meetings only.

Example:

```text
Today
2:00 PM - Intro with Sarah from Ramp
4:30 PM - Call with investor

Tomorrow
10:00 AM - Demo with Acme Ops team
```

Each meeting has a button:

```text
Brief me
```

### 2. User selects a meeting

When the user clicks **Brief me**, the app extracts basic meeting information:

```text
Meeting title
Date and time
Attendees
Attendee email domains
Description
Location or meeting link
```

The app should try to infer:

```text
Person name
Company name
Company domain
Meeting purpose
```

Example:

```text
Title: Intro with Sarah from Ramp
Attendee: sarah@ramp.com

Inferred:
Person: Sarah
Company: Ramp
Domain: ramp.com
Meeting type: Intro / sales / partnership
```

The user should be allowed to quickly edit this before generating the briefing.

### 3. App finds relevant Notion context

The app searches Notion using:

```text
Person name
Company name
Meeting title
Company domain
Keywords from meeting description
```

The goal is to find relevant internal context, such as:

```text
Past notes about the company
Previous meeting notes
Research notes
Project notes
Sales notes
Todo items
Internal positioning notes
```

The MVP can keep this simple:

```text
Show the top 3 to 5 matching Notion pages
Let the user select which ones to include
```

This avoids over-automation and prevents bad context from polluting the briefing.

### 4. App researches public context

The app uses web automation/research to collect public information about the company/person.

It should look for:

```text
Company website
About page
Product pages
Pricing page
Blog posts
Recent announcements
Public profile pages
News mentions
Docs or changelog if relevant
```

The research should be narrow and focused. Do not try to browse too much.

The goal is to answer:

```text
What does this company do?
Who is this person likely to be?
What are they probably working on?
What has changed recently?
What should I know before talking to them?
```

### 5. App generates the meeting briefing

The briefing should be structured and tactical.

Output sections:

```text
60-second summary
Who you are meeting
Company overview
Relevant Notion context
Recent public context
Likely pain points
Suggested opening line
Best questions to ask
Possible angles for the conversation
Risks or red flags
Suggested follow-up email
Sources used
```

The most important sections for the demo are:

```text
60-second summary
Suggested opening line
Best questions to ask
Relevant internal context
```

### 6. User can ask follow-up questions by voice

After the briefing is generated, the user can talk to the agent.

Example questions:

```text
What should I ask first?
Give me a more technical angle.
What do I already know about this company from my notes?
What should I avoid saying?
Draft a follow-up email.
Give me a 30-second version.
```

The voice layer should use the generated briefing as its context.

The goal is not to build a general assistant. The goal is to answer questions about the selected meeting.

## Sponsor stack

Use this stack:

```text
Vapi
TinyFish
Redis
InsForge
WunderGraph
Chainguard
```

Optional external integrations:

```text
Google Calendar
Notion
```

## Tool roles

### Vapi

Use Vapi as the voice interface.

It should support:

```text
Ask for a briefing by voice
Hear the 60-second summary
Ask follow-up questions
Get suggested questions or opening lines verbally
```

Example demo moment:

```text
User:
Brief me for my meeting with Sarah from Ramp.

Agent:
Here is the 60-second brief...
```

Vapi should not be the whole app. It is the voice layer on top of the briefing workflow.

### TinyFish

Use TinyFish for public web research.

It should collect external context from the web:

```text
Company website
Product pages
Blog posts
Recent announcements
Public pages about the person/company
```

TinyFish should answer specific research tasks, not broad open-ended browsing.

Example tasks:

```text
Find what the company does
Find recent company updates
Find product positioning
Find pricing or target customer if available
Find public background on the person if available
```

### Redis

Use Redis for speed and temporary state.

Use it for:

```text
Research job status
Short-term voice conversation memory
Cached web research results
Cached Notion page summaries
Briefing generation progress
```

Redis should make the product feel fast and responsive.

Example use:

```text
The app shows:
Researching company website
Reading Notion notes
Finding recent updates
Generating questions
```

Redis can store that progress state.

### InsForge

Use InsForge as the main backend.

Use it for:

```text
Users
Meetings
Briefings
Companies
Contacts
Selected Notion pages
Research sources
Generated summaries
Call transcripts or voice interactions
```

InsForge is the main app data store.

The app should persist every generated briefing so users can revisit it later.

### WunderGraph

Use WunderGraph as the unified API layer.

It should connect the frontend, voice layer, backend, research worker, and external integrations.

It can expose clean app actions like:

```text
listUpcomingMeetings
createBriefingFromMeeting
searchNotionContext
generateBriefing
getBriefing
askBriefingQuestion
```

The reason to use WunderGraph is that the app talks to several systems. WunderGraph keeps the frontend and voice layer from directly calling everything separately.

### Chainguard

Use Chainguard for the autonomous research worker container.

The research worker should be the service that:

```text
Receives a briefing job
Uses TinyFish for web research
Reads selected Notion context
Updates Redis progress
Saves final results to InsForge
```

Chainguard gives the project a production-ready security angle:

> “Because this app processes private meeting context and external web content, the autonomous research worker runs in a hardened container.”

## External integrations

### Google Calendar

Use Calendar to show the user’s upcoming meetings.

Keep it read-only.

The app should only need:

```text
Upcoming events
Meeting titles
Attendees
Descriptions
Times
```

Do not create or update calendar events.

MVP behavior:

```text
Show the next 5 to 10 meetings
Only prioritize meetings with external attendees
Let user choose one
```

### Notion

Use Notion to read internal/private context.

Keep it simple.

MVP behavior:

```text
Search Notion by company/person/meeting title
Show top matching pages
Let user select 1 to 3 pages
Read those pages
Summarize relevant context
```

Do not sync the whole Notion workspace.

Do not write back to Notion in the first version.

## Recommended MVP scope

Build only these features:

```text
1. Calendar meeting picker
2. Manual company/person correction
3. Notion context search and selection
4. Public web research
5. Structured briefing generation
6. Voice Q&A over the briefing
7. Saved briefing dashboard
```

Avoid these for the hackathon:

```text
Full CRM
Email integration
Writing notes back to Notion
Creating calendar events
Team collaboration
Payments
Background sync of all meetings
Deep Notion workspace indexing
```

## Product flow

```text
User opens app
  ↓
App shows upcoming meetings from Calendar
  ↓
User selects one meeting
  ↓
App infers person/company
  ↓
User confirms or edits
  ↓
App searches Notion for relevant notes
  ↓
User selects relevant Notion pages
  ↓
App runs public web research with TinyFish
  ↓
Redis tracks progress and caches results
  ↓
InsForge stores the meeting, context, sources, and briefing
  ↓
WunderGraph exposes the briefing to frontend and Vapi
  ↓
Vapi lets the user hear the brief and ask questions
```

## Demo script

Use a polished demo around one meeting.

Example:

```text
Meeting:
Intro with Sarah from Ramp

Goal:
Prepare for a sales/discovery call about AI workflow automation.
```

Demo steps:

```text
1. Open dashboard
2. Show upcoming meetings
3. Select “Intro with Sarah from Ramp”
4. App infers Sarah + Ramp
5. App finds relevant Notion notes about finance workflows
6. User selects 2 Notion pages
7. App researches Ramp publicly
8. Progress UI shows what is happening
9. App generates a structured briefing
10. User clicks “Call briefing agent”
11. Vapi reads the 60-second summary
12. User asks: “What should I ask first?”
13. Agent answers with 3 strong questions based on Notion + public research
```

## What the generated briefing should look like

Example structure:

```text
Meeting Briefing

1. 60-second summary
A concise spoken-ready summary.

2. Who you are meeting
Person, role if known, company, likely responsibility.

3. Company context
What the company does, target customers, recent updates.

4. Your internal context
Relevant notes from Notion.

5. Best conversation angle
The strongest angle for this meeting.

6. Suggested opening line
A concrete first sentence.

7. Questions to ask
5 tactical questions.

8. Likely pain points
3 to 5 likely problems this person/company may care about.

9. Risks / things to avoid
Potential weak assumptions or sensitive areas.

10. Follow-up email draft
A short email ready to send after the meeting.

11. Sources
Notion pages and public pages used.
```

## What makes it amazing

The “wow” moment is:

```text
The user does not type a company into a chatbot.
The app already knows their next meetings.
It finds relevant private notes.
It researches public context.
It produces a tactical briefing.
Then the user can talk to it by voice.
```

That feels much more like a real product.

## What makes it simple

The app should not try to do everything.

Keep the core loop:

```text
Pick meeting
→ choose context
→ generate brief
→ ask voice follow-ups
```

Everything else is optional.

## Final product definition

Build:

> **PreCall, a voice-first meeting prep agent that turns your calendar, Notion notes, and public web research into a tactical briefing before every meeting.**

Use:

```text
Vapi = voice interface
TinyFish = public web research
Redis = cache, progress, short-term memory
InsForge = backend and persistent data
WunderGraph = unified API layer
Chainguard = secure research worker
Google Calendar = upcoming meetings
Notion = private context
```

Target outcome:

```text
In under one minute, a user can pick an upcoming meeting and get a useful, source-backed briefing with voice Q&A.
```
