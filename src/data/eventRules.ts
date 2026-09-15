// Team-format note shared by every Day 2 team event: each member registers
// individually online and the team is formed at the venue on event day.
const TEAM_UP_NOTE_DAY2 =
  "Team format: every participant registers individually online before the event. Teams assemble at the venue on event day - e.g. a 4-player team means all 4 members register separately and team up at the venue.";

export const eventRulesMap: Record<string, string[]> = {
  "Throwball": [
    "7 players per team are allowed on the court.",
    "The ball must be caught with both hands and thrown with one hand.",
    "The ball must be released within 3 seconds.",
    "Players must not touch the net or step outside the court.",
    "A dropped/out ball or foul gives 1 point to the opponent.",
    "The match is generally best of 3 sets, with each set played to 25 points."
  ],
  "Kho-Kho": [
    "12 players per team; 9 players play at a time.",
    "The active chaser tries to touch the defenders.",
    "A “Kho” is given by touching a seated teammate and clearly saying “Kho.”",
    "The chaser must follow the direction and pole-turn rules.",
    "A defender who goes outside the boundary is declared out.",
    "Each defender out earns 1 point; the team with the higher score wins."
  ],
  "Cricket": [
    "An ID card is mandatory for all players.",
    "No passed outs will be allowed.",
    "Shoes are mandatory for all sports.",
    "Each team plays 1 innings of 5 overs.",
    "Each team consists of 11 players with 3 substitutes.",
    "1 bowler can bowl a maximum of 1 over.",
    "No bowler can bowl two consecutive overs.",
    "Maximum 3 runs running between wickets.",
    "Open ground, tennis ball, chucking match.",
    "You can bring your own bat.",
    "Umpire decision is final.",
    "Organizers can change the rules according to the time situation, such as reducing overs."
  ],
  "Football (7s)": [
    "An ID card is mandatory for all players.",
    "No passed outs will be allowed.",
    "Shoes are mandatory for all sports.",
    "7 players, including 1 goalkeeper, with 3 substitutes.",
    "Match duration: 10 minutes each half (total 20 minutes).",
    "No added time.",
    "If the match is a draw, the winner will be decided by a 5-penalty shootout.",
    "Sliding tackles are not allowed.",
    "Standard fouls apply, including handball, pushing, etc.",
    "Umpire decision is final."
  ],
  "Football": [
    "An ID card is mandatory for all players.",
    "No passed outs will be allowed.",
    "Shoes are mandatory for all sports.",
    "7 players, including 1 goalkeeper, with 3 substitutes.",
    "Match duration: 10 minutes each half (total 20 minutes).",
    "No added time.",
    "If the match is a draw, the winner will be decided by a 5-penalty shootout.",
    "Sliding tackles are not allowed.",
    "Standard fouls apply, including handball, pushing, etc.",
    "Umpire decision is final."
  ],
  "Volleyball": [
    "An ID card is mandatory for all players.",
    "No passed outs will be allowed.",
    "Shoes are mandatory for all sports.",
    "6 players on court per team with 3 substitutes.",
    "Maximum 3 touches per team.",
    "2 sets with 15 points; the deciding set contains points as specified.",
    "Catching, holding, or throwing the ball is prohibited.",
    "Touching the net or crossing the center line is prohibited.",
    "Umpire decision is final."
  ],
  "Kabaddi": [
    "An ID card is mandatory for all players.",
    "No passed outs will be allowed.",
    "Shoes are mandatory for all sports.",
    "7 players per team on the court, plus 5 substitutes.",
    "2 halves of 10 minutes each with a 3-minute break.",
    "Complete the raid within 30 seconds.",
    "The team with the most points at the end of both halves wins.",
    "Umpire decision is final."
  ],

  // ─── Day 2 · Technical events ─────────────────────────────────────────

  "Paper Presentation": [
    TEAM_UP_NOTE_DAY2,
    "Eligibility: Students, faculty and industry professionals from any discipline.",
    "Team size: 2-3 participants. Any topic is permitted.",
    "Submit the abstract at least 3 days before the event.",
    "Presentation: 5 minutes + 1-2 minutes Q&A; PPT only; carry a backup copy.",
    "Content must be original and plagiarism-free.",
    "Judging: content, originality, technical knowledge, presentation, clarity, time management and Q&A.",
    "Participants must follow the time limit and maintain proper decorum.",
    "Plagiarism, misconduct, inappropriate content or rule violations may lead to disqualification.",
    "Judges' decision is final; organizers may modify rules when necessary."
  ],
  "Hackathon": [
    TEAM_UP_NOTE_DAY2,
    "Teams: 2-4 eligible college students; each participant may join only one team.",
    "Register before the deadline with accurate details. Team changes require approval.",
    "Core development must happen during the official hackathon period; pre-built projects cannot be submitted as new work.",
    "AI tools, APIs, frameworks, libraries and public datasets are permitted unless restricted. Teams must understand and explain their work.",
    "Submit the required source code/repository, description, demo/presentation and other materials before the deadline.",
    "Judging: Innovation 20%, Technical Implementation 25%, Problem Impact 20%, UX 15%, Feasibility & Scalability 10%, Presentation/Demo 10%.",
    "Mentors may guide but must not build substantial parts of the solution.",
    "Unauthorized access, attacks, data theft, disruption or interference are prohibited.",
    "Cheating, plagiarism, falsification, misconduct or serious rule violations may cause immediate disqualification."
  ],
  "Debugging": [
    TEAM_UP_NOTE_DAY2,
    "Team size: 2-4. Languages: Python and Java. Duration: 1 hour.",
    "Teams receive printed code containing syntax, logical, runtime or implementation errors.",
    "Identify/highlight errors and write corrected code on the provided answer sheet.",
    "No computers or electronic devices, internet, AI tools, external references or outside assistance.",
    "Use only organizer-approved paper and pen. Team discussion is allowed.",
    "Answers must be clear, legible and submitted before time expires.",
    "Copying, sharing answers, cheating or unauthorized assistance may disqualify the entire team.",
    "Judging panel's decision is final."
  ],
  "Logo Making": [
    TEAM_UP_NOTE_DAY2,
    "Team size: 2-4. Theme is announced at the start.",
    "Time limit: 30 minutes; no extra time.",
    "AI-generated or AI-assisted logo creation is strictly prohibited.",
    "Non-AI design software may be used. No generative fill, text-to-image or AI design features.",
    "Logo must be created from scratch during the competition. No templates, downloaded, pre-designed, traced or copied logos.",
    "Submit ONE final logo in Microsoft Word (.doc/.docx) format.",
    "Violation of AI, originality, submission or time rules may result in disqualification.",
    "Judging/organizing committee decision is final."
  ],
  "Quiz": [
    TEAM_UP_NOTE_DAY2,
    "Teams: 2-4; one member must be the Team Leader. Each participant may join only one team.",
    "Questions range from easy to difficult. Fast-answer questions go to the first team to raise the hand/buzzer.",
    "Quizmaster's decision on who responded first is final.",
    "Answers must be given within the allotted time and cannot be changed after submission.",
    "Mobile phones, smartwatches, internet searches, unauthorized notes and outside assistance are prohibited.",
    "AI tools, including ChatGPT and AI coding assistants, are not allowed.",
    "Cheating, misconduct or repeated failure to follow instructions may lead to disqualification.",
    "Violation by one member may disqualify the entire team. Final decision rests with the Quizmaster/judging panel."
  ],
  "Tech Maze": [
    TEAM_UP_NOTE_DAY2,
    "Five missions: Human Google, Tech Black Box, Tech Relay, Tech Diagnosis and Tech Assembly Challenge.",
    "Teams: 3-4 participants; maximum 5 teams per batch.",
    "Complete all stations in the assigned order; maximum 3 minutes per station.",
    "No mobile phones, smartwatches, AI, Google or online resources. Do not seek help or share clues.",
    "Handle all materials carefully and move immediately when instructed.",
    "Winner: least overall completion time. Tie-breaker: fewest mistakes, followed by Technical Rapid Fire if still tied.",
    "Cheating or misconduct results in immediate disqualification.",
    "Coordinator/volunteer decision is final."
  ],

  // ─── Day 2 · Non-Technical events ─────────────────────────────────────

  "Squid Game": [
    "Round 1 - Green Light, Red Light",
    "Teams will be divided into batches.",
    "Each batch will play 3-4 songs; participants must move while the song plays and freeze when it stops.",
    "Anyone moving after the song stops is disqualified.",
    "The first 3 participants to reach the finish line from each batch qualify.",
    "All qualifiers advance to Round 2.",
    "Round 2 - Final Puzzle",
    "All qualifiers compete individually.",
    "Each participant receives a puzzle to solve.",
    "No outside help is allowed.",
    "The first correct finisher is the Winner; the second correct finisher is the Runner-up."
  ],
  "Mobile Gaming (BGMI/FreeFire)": [
    TEAM_UP_NOTE_DAY2,
    "Free Fire Tournament: registered UID and name only.",
    "Free Fire: no hacks, cheats, scripts, teaming, or exploits.",
    "Free Fire: BR Squad - highest team score wins.",
    "Free Fire: CS - 4v4, BO1; in-game result wins.",
    "Free Fire: violations = penalty/disqualification. Organizer's decision is final.",
    "BGMI: BR Erangel Squad - placement + kills decide.",
    "BGMI: TDM Warehouse - first to kill limit wins.",
    "BGMI: mobile only - no external gaming accessories.",
    "BGMI: no hacks, cheats, third-party apps, teaming, or exploits.",
    "BGMI: disputes need valid proof. Organizer's decision is final."
  ],
  "Ramp Walk": [
    "Entries: individual and group entries are allowed.",
    "Time Limit: individual - 2-3 mins; group - 5-7 mins.",
    "Reporting: participants must report 15 mins before the event.",
    "Costume: participants arrange their own costumes, accessories and makeup; offensive, unsafe or inappropriate costumes are not allowed.",
    "Presentation & Judging: stay within the allotted time; judges' decision is final and binding."
  ],
  "Connexion": [
    TEAM_UP_NOTE_DAY2,
    "Round 1 - Find the Connection",
    "Participants will be divided into teams/batches.",
    "Each team will be shown a set of pictures, words, logos, or clues.",
    "Participants must identify the common connection between the given clues.",
    "Teams must submit their answer within the given time limit.",
    "Correct answers will earn points.",
    "The teams with the highest scores will qualify for Round 2.",
    "Round 2 - Final Connection",
    "All qualified teams will compete in the final round.",
    "Each team will be given a series of clues to identify the hidden connection.",
    "No outside help or electronic devices will be allowed.",
    "The team that gives the maximum number of correct answers within the given time will be the Winner.",
    "The team with the second-highest score will be the Runner-up.",
    "In case of a tie, a tie-breaker question/round will be conducted."
  ]
};
