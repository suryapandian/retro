import type { Column } from "./types";

export interface Template {
  id: string;
  name: string;
  columns: Column[];
}

export const TEMPLATES: Template[] = [
  {
    id: "start-stop-continue",
    name: "Start / Stop / Continue",
    columns: [
      { id: "start", title: "Start", prompt: "What should we start doing?" },
      { id: "stop", title: "Stop", prompt: "What should we stop doing?" },
      { id: "continue", title: "Continue", prompt: "What should we keep doing?" },
    ],
  },
  {
    id: "mad-sad-glad",
    name: "Mad / Sad / Glad",
    columns: [
      { id: "mad", title: "Mad", prompt: "What frustrated you?" },
      { id: "sad", title: "Sad", prompt: "What disappointed you?" },
      { id: "glad", title: "Glad", prompt: "What made you happy?" },
    ],
  },
  {
    id: "4ls",
    name: "4Ls",
    columns: [
      { id: "liked", title: "Liked" },
      { id: "learned", title: "Learned" },
      { id: "lacked", title: "Lacked" },
      { id: "longed-for", title: "Longed for" },
    ],
  },
  {
    id: "went-well",
    name: "Went Well / To Improve / Ideas",
    columns: [
      { id: "went-well", title: "Went well" },
      { id: "to-improve", title: "To improve" },
      { id: "ideas", title: "Ideas" },
    ],
  },
  {
    id: "sailboat",
    name: "Sailboat",
    columns: [
      { id: "wind", title: "Wind", prompt: "What pushed us forward?" },
      { id: "anchors", title: "Anchors", prompt: "What held us back?" },
      { id: "rocks", title: "Rocks", prompt: "What risks lie ahead?" },
      { id: "island", title: "Island", prompt: "Where do we want to get to?" },
    ],
  },
];
