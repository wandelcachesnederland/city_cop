import type { AreaId } from './world';

// Every call type and its consequence for each of the four choices
export type Action = 'arrest' | 'help' | 'ticket' | 'shoot';
export const ACTIONS: Action[] = ['arrest', 'help', 'ticket', 'shoot'];
export const ACTION_INFO: Record<Action, { label: string; key: string; color: string; icon: string }> = {
  arrest: { label: 'ARREST', key: '1', color: '#4fc3ff', icon: '⛓' },
  help: { label: 'HELP', key: '2', color: '#5cff9d', icon: '♥' },
  ticket: { label: 'TICKET', key: '3', color: '#ffd84d', icon: '✎' },
  shoot: { label: 'SHOOT', key: '4', color: '#ff4d6d', icon: '✸' },
};

export interface Outcome {
  pts: number;
  trust: number;
  text: string;
}

export type Behavior = 'idle' | 'flee' | 'hostile' | 'wander' | 'road';

export interface IncidentDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  behavior: Behavior;
  weight: number;
  minTime?: number;
  urgent?: boolean;
  areas?: AreaId[];
  prop?: 'car' | 'graffiti' | 'stall' | 'cat';
  radio: string;
  outcomes: Record<Action, Outcome>;
}

const murder = (who: string): Outcome => ({ pts: -600, trust: -40, text: `Deadly force on ${who}!` });

export const INCIDENTS: IncidentDef[] = [
  {
    id: 'jaywalk',
    title: 'Jaywalker',
    desc: 'Strolling through traffic like they own the road.',
    icon: '🚶',
    behavior: 'road',
    weight: 10,
    radio: '10-54: Pedestrian in traffic',
    outcomes: {
      ticket: { pts: 120, trust: 2, text: 'Citation issued' },
      help: { pts: 40, trust: 1, text: 'Escorted to the curb' },
      arrest: { pts: -80, trust: -6, text: 'Arrest for jaywalking?!' },
      shoot: murder('a jaywalker'),
    },
  },
  {
    id: 'parking',
    title: 'Double Parked',
    desc: 'Blocking a lane with hazards on. "Just 5 minutes!"',
    icon: '🚗',
    behavior: 'idle',
    weight: 8,
    prop: 'car',
    radio: '10-37: Vehicle blocking traffic',
    outcomes: {
      ticket: { pts: 140, trust: 2, text: 'Parking ticket slapped' },
      help: { pts: 30, trust: 1, text: 'Pointed to a free spot' },
      arrest: { pts: -80, trust: -6, text: 'Cuffed over parking? Yikes.' },
      shoot: murder('a bad parker'),
    },
  },
  {
    id: 'shoplift',
    title: 'Shoplifter',
    desc: 'Hoodie stuffed with stolen goods. Running!',
    icon: '🛍',
    behavior: 'flee',
    weight: 9,
    radio: '10-35: Shoplifter fleeing on foot',
    outcomes: {
      arrest: { pts: 260, trust: 4, text: 'Thief in cuffs!' },
      ticket: { pts: 60, trust: 0, text: 'Slap on the wrist' },
      help: { pts: -60, trust: -4, text: 'You helped a thief?!' },
      shoot: { pts: -450, trust: -30, text: 'Shot over shoplifting!' },
    },
  },
  {
    id: 'mugger',
    title: 'Mugger',
    desc: 'Just snatched a purse. Unarmed and sprinting.',
    icon: '👜',
    behavior: 'flee',
    weight: 8,
    urgent: true,
    radio: '10-31: Robbery in progress',
    outcomes: {
      arrest: { pts: 320, trust: 5, text: 'Mugger collared!' },
      ticket: { pts: -40, trust: -3, text: 'A ticket for robbery?' },
      help: { pts: -80, trust: -5, text: 'Aided a mugger?!' },
      shoot: { pts: -200, trust: -14, text: 'Unarmed! Excessive force.' },
    },
  },
  {
    id: 'robber',
    title: 'Armed Robber',
    desc: 'Gun drawn and firing! Take them down.',
    icon: '🔫',
    behavior: 'hostile',
    weight: 6,
    minTime: 25,
    urgent: true,
    radio: '10-32: Shots fired! Armed suspect',
    outcomes: {
      arrest: { pts: 550, trust: 8, text: 'HEROIC TAKEDOWN!' },
      shoot: { pts: 320, trust: 3, text: 'Threat neutralized' },
      ticket: { pts: -120, trust: -6, text: 'Ticketing a gunman?!' },
      help: { pts: -120, trust: -6, text: 'You... helped him reload?' },
    },
  },
  {
    id: 'gang',
    title: 'Gang Shooter',
    desc: 'Spraying bullets on the block. Civilians at risk!',
    icon: '💀',
    behavior: 'hostile',
    weight: 4,
    minTime: 70,
    urgent: true,
    areas: ['southside', 'docks', 'midtown'],
    radio: '10-33: Gang shooting!',
    outcomes: {
      arrest: { pts: 650, trust: 9, text: 'LEGENDARY ARREST!' },
      shoot: { pts: 380, trust: 4, text: 'Shooter down' },
      ticket: { pts: -150, trust: -8, text: 'Ticket? He is shooting!' },
      help: { pts: -150, trust: -8, text: 'Not the time to help!' },
    },
  },
  {
    id: 'injured',
    title: 'Injured Cyclist',
    desc: 'Hit and run victim. Bleeding, needs aid NOW.',
    icon: '🩹',
    behavior: 'idle',
    weight: 7,
    urgent: true,
    radio: '10-52: Injured person, need assist',
    outcomes: {
      help: { pts: 280, trust: 7, text: 'First aid applied. Hero!' },
      ticket: { pts: -120, trust: -8, text: 'Ticketed the victim?!' },
      arrest: { pts: -150, trust: -10, text: 'Arrested the victim!' },
      shoot: murder('an injured victim'),
    },
  },
  {
    id: 'cardiac',
    title: 'Cardiac Arrest',
    desc: 'Collapsed on the sidewalk. Needs CPR!',
    icon: '💔',
    behavior: 'idle',
    weight: 5,
    urgent: true,
    radio: '10-45: Person down, not breathing',
    outcomes: {
      help: { pts: 360, trust: 9, text: 'CPR! They are breathing!' },
      ticket: { pts: -150, trust: -10, text: 'Ticketed a dying man!' },
      arrest: { pts: -150, trust: -10, text: 'Cuffed an unconscious man?' },
      shoot: murder('a heart attack victim'),
    },
  },
  {
    id: 'tourist',
    title: 'Lost Tourist',
    desc: 'Upside-down map, very confused.',
    icon: '🗺',
    behavior: 'idle',
    weight: 7,
    areas: ['downtown', 'chinatown', 'park', 'midtown'],
    radio: 'Citizen requests directions',
    outcomes: {
      help: { pts: 160, trust: 4, text: 'Directions given. 5 stars!' },
      ticket: { pts: -40, trust: -3, text: 'Ticketed a tourist...' },
      arrest: { pts: -100, trust: -7, text: 'Arrested a tourist!' },
      shoot: murder('a tourist'),
    },
  },
  {
    id: 'drunk',
    title: 'Drunk & Disorderly',
    desc: 'Singing loudly, swaying, knocking over bins.',
    icon: '🍺',
    behavior: 'wander',
    weight: 8,
    radio: '10-56: Intoxicated person',
    outcomes: {
      help: { pts: 170, trust: 3, text: 'Called them a cab home' },
      arrest: { pts: 90, trust: 1, text: 'Sleeping it off in a cell' },
      ticket: { pts: 30, trust: -1, text: 'Public intox fine' },
      shoot: murder('a drunk'),
    },
  },
  {
    id: 'tagger',
    title: 'Graffiti Tagger',
    desc: 'Caught mid-spray on private property.',
    icon: '🎨',
    behavior: 'idle',
    weight: 6,
    prop: 'graffiti',
    radio: '10-94: Vandalism in progress',
    outcomes: {
      ticket: { pts: 160, trust: 2, text: 'Vandalism fine issued' },
      arrest: { pts: 110, trust: 1, text: 'Booked for vandalism' },
      help: { pts: -30, trust: -2, text: 'You held the spray can?' },
      shoot: murder('a tagger'),
    },
  },
  {
    id: 'vendor',
    title: 'Unlicensed Vendor',
    desc: 'Hot dogs, no permit. Smells great though.',
    icon: '🌭',
    behavior: 'idle',
    weight: 5,
    prop: 'stall',
    radio: 'Complaint: unlicensed vendor',
    outcomes: {
      ticket: { pts: 130, trust: 1, text: 'Permit violation cited' },
      help: { pts: 90, trust: 3, text: 'Helped file a permit' },
      arrest: { pts: -60, trust: -5, text: 'Arrested the hot dog guy?!' },
      shoot: murder('a hot dog vendor'),
    },
  },
  {
    id: 'carthief',
    title: 'Car Thief',
    desc: 'Jimmying a car door with a coat hanger.',
    icon: '🔧',
    behavior: 'flee',
    weight: 6,
    prop: 'car',
    radio: '10-16: Auto theft in progress',
    outcomes: {
      arrest: { pts: 320, trust: 5, text: 'Car thief nabbed!' },
      ticket: { pts: -30, trust: -2, text: 'Ticketed a car thief?' },
      help: { pts: -80, trust: -5, text: 'Helped steal a car!' },
      shoot: { pts: -300, trust: -20, text: 'Lethal force on a car thief!' },
    },
  },
  {
    id: 'cat',
    title: 'Cat Up A Tree',
    desc: 'A crying kid points at a very stuck kitty.',
    icon: '🐱',
    behavior: 'idle',
    weight: 4,
    prop: 'cat',
    areas: ['suburbs', 'park'],
    radio: 'Kid reports stuck kitten',
    outcomes: {
      help: { pts: 220, trust: 6, text: 'Kitty saved! Kid cheers!' },
      ticket: { pts: -60, trust: -5, text: 'Ticketed a crying child!' },
      arrest: { pts: -150, trust: -12, text: 'Arrested a child?!' },
      shoot: murder('a child'),
    },
  },
  {
    id: 'brawl',
    title: 'Street Brawler',
    desc: 'Throwing punches outside the bar.',
    icon: '👊',
    behavior: 'wander',
    weight: 6,
    areas: ['downtown', 'midtown', 'chinatown', 'southside'],
    radio: '10-10: Fight in progress',
    outcomes: {
      arrest: { pts: 240, trust: 4, text: 'Brawler cuffed' },
      help: { pts: 120, trust: 2, text: 'De-escalated. Nice.' },
      ticket: { pts: 20, trust: -1, text: 'Weak response' },
      shoot: { pts: -350, trust: -25, text: 'Shot a fist fighter!' },
    },
  },
];

export const INNOCENT_SHOT: Outcome = { pts: -700, trust: -45, text: 'INNOCENT CIVILIAN SHOT!' };
export const CUFFED_SHOT: Outcome = { pts: -700, trust: -45, text: 'Shot a handcuffed suspect!' };
export const PED_HIT: Outcome = { pts: -150, trust: -10, text: 'Ran over a pedestrian!' };
