# SEEK — Autonomous Search Intelligence

A working React + TypeScript command center for a simulated autonomous drone search. The application runs entirely in the browser and needs no API keys, account, backend, or real drone.

## Live command center (real agent)

The default page is the live command center, connected to the SEEK backend (`backend/`, `uv run fleet-viewer`):
drone camera and 3D map on top, Grok's agent graph across the bottom. Decisions (approve a move, confirm a find)
are made next to the graph; click a node or a step for what Grok saw, its prompt and its answer.

```sh
cd ../backend && uv run fleet-viewer --video flight.mp4   # or --webcam 0, --tello (serves the API on :8001)
cd ../frontend && npm install && npm run dev              # http://localhost:5173, /api is proxied to :8001
```

`SEEK_BACKEND_URL=http://127.0.0.1:8003 npm run dev` points it at another backend port. The original simulation
(no backend) is still at `http://localhost:5173/?sim`.

## Run the simulation locally

Use Node.js 22 or later:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. To verify and build:

```sh
npm test
npm run build
npm run preview
```

The production output is in `dist/` and can be served by a static web host. No external images, fonts, or other runtime media services are required.

## Demonstrate a mission

1. Keep the default Museum Search objective or choose another scenario.
2. Press **Start Mission**. The default placement first reveals a partial clothing match, then a stronger candidate after approximately 80 simulated seconds.
3. Use **1× / 2× / 4×** to change simulation speed. Inspect sectors on the map or read the full mission log while the search continues.
4. Review the candidate's observed clothing and accessories. **Confirm clothing match** completes the mission; **Reject & continue** resumes exploration.
5. Closing the candidate review pauses it. **Resume** reopens the same review without moving the drone.
6. **New mission**, **Reset mission**, or the placement shuffle prepares another run. Changing scenarios selects a new fictional environment and objective.

The three scenarios are Museum Search, Missing Visitor (a consenting role-play), and Warehouse Inspection. Each includes a matching participant and visual decoys. Placement seeds make runs reproducible; reshuffling changes hidden locations.

## Supported target descriptions

The local parser recognizes color + clothing/accessory phrases, such as:

- “Find someone wearing a red hoodie and black trousers.”
- “Find someone wearing a blue jacket and carrying a yellow bag.”
- “Find an authorized worker wearing an orange safety vest, navy trousers and a white hard hat.”
- “Find a person in a purple coat and beige trousers with a green backpack.”

Supported garments include hoodies, jackets, shirts, T-shirts, vests, coats, sweaters, sweatshirts, trousers, pants, jeans, and shorts. Accessories include bags, backpacks, helmets, hard hats, caps, and hats. Colors include red, blue, black, yellow, green, orange, white, gray/grey, navy, purple, brown, beige, tan, pink, lime, teal, and olive.

The parser uses the first recognized item for upper clothing, lower clothing, and accessories. It does not interpret arbitrary natural language, names, identity, relationships, negations, or nonvisual attributes. A description with no recognized clothing cue produces an explanatory validation message. Matching evaluates the recognized appearance cues only.

## What is simulated

- The map is an authored fictional indoor environment, not a reconstruction from camera imagery.
- Telemetry, vehicle movement, camera scenes, people, and activity messages are generated locally.
- “Grok activity” is explicitly labeled as a simulated agent. No Grok API is called.
- The policy chooses among unobserved sectors and unresolved observations using coverage, distance, and already revealed clothing cues. It receives no hidden participant location or scenario seed.
- Distant observations reveal upper clothing only. A follow-up inspection reveals lower clothing and accessories. Camera imagery uses those revealed observations.
- Attribute agreement is a fraction of requested cues that match, not a calibrated probability or identity confidence score.
- Operator confirmation accepts an appearance match. It does not verify personal identity or establish that a real person is authorized.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components/` | Operator controls, map, camera, telemetry, logs, and evidence review |
| `src/types.ts` | Shared mission, region, observation, candidate, and event-facing data shapes |
| `src/useMission.ts` | React lifecycle and the simulation timer; cleans up on unmount |
| `src/simulation/engine.ts` | Framework-independent mission state machine and simulated movement |
| `src/simulation/policy.ts` | Observation-only search decisions and corridor routing |
| `src/simulation/target.ts` | Local visual-description parsing and attribute comparison |
| `src/simulation/scenarios.ts` | Fictional environments and default configuration |
| `src/adapters/simulatedWorld.ts` | Seeded hidden participants; reveals evidence only when a sector is observed |
| `src/adapters/contracts.ts` | Future drone, analysis, telemetry, and event-connection interfaces |
| `src/simulation/engine.test.ts` | Mission transitions, observation boundaries, seeded runs, and navigation tests |

Mission state is kept in memory. Resetting or refreshing clears the active run. The mission log can be exported as JSON from the interface.

## Future hardware and Grok integration

`DroneAdapter` describes connection, movement, hold, landing, and telemetry subscription. Implement it through a Python service using DJITelloPy; the browser should communicate with that service rather than access a drone directly.

`AnalysisAdapter` separates camera analysis from the next-search decision. A Grok implementation should return structured observations and a decision based only on the revealed mission context. Keep API credentials on the backend.

`MissionEventConnection` and the `MissionEvent` union provide a boundary for WebSocket or server-sent telemetry, observations, activity, and state updates. Replacing the local engine with a backend-driven controller should preserve the operator-facing `MissionController` interface. These contracts are integration seams, not implemented real-device connections.
