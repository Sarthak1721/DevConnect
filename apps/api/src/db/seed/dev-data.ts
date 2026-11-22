import type { EducationEntry, ExperienceEntry } from '../schema';

// Fictional people and posts for local development: enough to make every screen of the app look
// realistic, small enough to read. Links point at example.com (reserved for documentation), never
// at real accounts.

export const SKILLS = [
  ['TypeScript', 'typescript'],
  ['JavaScript', 'javascript'],
  ['React', 'react'],
  ['Next.js', 'next-js'],
  ['Node.js', 'node-js'],
  ['Express', 'express'],
  ['PostgreSQL', 'postgresql'],
  ['Redis', 'redis'],
  ['Docker', 'docker'],
  ['Kubernetes', 'kubernetes'],
  ['Python', 'python'],
  ['Machine Learning', 'machine-learning'],
  ['Go', 'go'],
  ['Rust', 'rust'],
  ['AWS', 'aws'],
  ['GraphQL', 'graphql'],
  ['Tailwind CSS', 'tailwind-css'],
  ['Embedded C', 'embedded-c'],
] as const;

type SkillSlug = (typeof SKILLS)[number][1];

export type SeedDeveloper = {
  username: string;
  name: string;
  headline: string;
  bio: string;
  location: string;
  skills: SkillSlug[];
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
  posts: { content: string; hoursAgo: number }[];
};

export const DEVELOPERS: SeedDeveloper[] = [
  {
    username: 'aarav-mehta',
    name: 'Aarav Mehta',
    headline: 'Backend engineer · Postgres and Node.js',
    bio: 'I like making slow queries fast and writing about how.',
    location: 'Pune, India',
    skills: ['typescript', 'node-js', 'postgresql', 'redis', 'docker'],
    experience: [
      {
        title: 'Backend Engineer',
        company: 'Example Payments',
        startDate: '2024-07',
        endDate: null,
        description: 'Ledger service and its PostgreSQL schema.',
      },
    ],
    education: [
      {
        school: 'Example Institute of Technology',
        degree: 'BTech, Computer Engineering',
        startYear: 2020,
        endYear: 2024,
      },
    ],
    posts: [
      {
        content:
          'TIL: Postgres does not index foreign key columns for you. Deleting one row from a parent table scanned 2 million child rows until I added the index.',
        hoursAgo: 3,
      },
      {
        content:
          'Switched our feed from OFFSET to keyset pagination. Page 500 no longer reads 10,000 rows first.',
        hoursAgo: 40,
      },
    ],
  },
  {
    username: 'priya-nair',
    name: 'Priya Nair',
    headline: 'Frontend developer · React, Next.js, accessibility',
    bio: 'Building interfaces that work with a keyboard and a screen reader, not just a mouse.',
    location: 'Bengaluru, India',
    skills: ['react', 'next-js', 'typescript', 'tailwind-css'],
    posts: [
      {
        content:
          'Reminder: a button that is a div with an onClick is not a button. Use <button> and you get keyboard support for free.',
        hoursAgo: 6,
      },
      {
        content:
          'React Server Components cut our profile page JavaScript by half. Write-up coming this weekend.',
        hoursAgo: 70,
      },
    ],
  },
  {
    username: 'diego-alvarez',
    name: 'Diego Alvarez',
    headline: 'Platform engineer · Kubernetes and Go',
    bio: 'Infrastructure that nobody has to think about.',
    location: 'Madrid, Spain',
    skills: ['go', 'kubernetes', 'docker', 'aws'],
    posts: [
      {
        content:
          'Our container images went from 1.2 GB to 38 MB with a multi-stage build and a distroless base image.',
        hoursAgo: 12,
      },
    ],
  },
  {
    username: 'mei-lin',
    name: 'Mei Lin',
    headline: 'ML engineer · Python, model serving',
    bio: 'Shipping models is 10% training and 90% everything around it.',
    location: 'Singapore',
    skills: ['python', 'machine-learning', 'docker', 'aws'],
    posts: [
      {
        content:
          'Benchmarking three model servers this week. Running the same load test on each and writing down p50 and p95, not just averages.',
        hoursAgo: 20,
      },
      {
        content:
          'Hot take: most ML bugs are data bugs. Validate your inputs at the boundary, exactly like an API does.',
        hoursAgo: 96,
      },
    ],
  },
  {
    username: 'kwame-mensah',
    name: 'Kwame Mensah',
    headline: 'Full-stack developer · open source maintainer',
    bio: 'Maintaining a small GraphQL library in my spare time.',
    location: 'Accra, Ghana',
    skills: ['graphql', 'typescript', 'node-js', 'react'],
    posts: [
      {
        content:
          'Released v2 of my GraphQL helper library. Biggest change: errors now carry a machine-readable code.',
        hoursAgo: 30,
      },
    ],
  },
  {
    username: 'sofia-rossi',
    name: 'Sofia Rossi',
    headline: 'Systems programmer · Rust',
    bio: 'Rewriting things in Rust, but only when it is worth it.',
    location: 'Milan, Italy',
    skills: ['rust', 'go', 'docker'],
    posts: [
      {
        content:
          'Wrote a tiny log parser in Rust. Running it on 4 GB of logs takes 9 seconds; the Python version took 3 minutes.',
        hoursAgo: 50,
      },
    ],
  },
  {
    username: 'ishaan-kulkarni',
    name: 'Ishaan Kulkarni',
    headline: 'Student · embedded systems and robotics',
    bio: 'Final-year engineering student. Robots, microcontrollers and the occasional web app.',
    location: 'Pune, India',
    skills: ['embedded-c', 'python', 'machine-learning'],
    education: [
      {
        school: 'Example College of Engineering',
        degree: 'BTech, Electronics',
        startYear: 2023,
        endYear: null,
      },
    ],
    posts: [
      {
        content:
          'Got my line-following robot running on a microcontroller with 2 KB of RAM. Every byte counts.',
        hoursAgo: 8,
      },
      {
        content:
          'Looking for feedback on my first REST API. Is returning 200 with an error message in the body a bad idea? (I think it is.)',
        hoursAgo: 120,
      },
    ],
  },
  {
    username: 'hannah-becker',
    name: 'Hannah Becker',
    headline: 'Security engineer · web application security',
    bio: 'Breaking things so attackers cannot.',
    location: 'Berlin, Germany',
    skills: ['javascript', 'python', 'aws', 'node-js'],
    posts: [
      {
        content:
          'Please stop storing JWTs in localStorage. Any script injected into the page can read it.',
        hoursAgo: 15,
      },
      {
        content:
          'Rotating refresh tokens with reuse detection: if an old token shows up again, revoke the whole session family.',
        hoursAgo: 60,
      },
    ],
  },
];

/** Who follows whom, by username. */
export const FOLLOWS: [follower: string, followee: string][] = [
  ['aarav-mehta', 'priya-nair'],
  ['aarav-mehta', 'hannah-becker'],
  ['aarav-mehta', 'diego-alvarez'],
  ['priya-nair', 'aarav-mehta'],
  ['priya-nair', 'kwame-mensah'],
  ['diego-alvarez', 'sofia-rossi'],
  ['diego-alvarez', 'aarav-mehta'],
  ['mei-lin', 'aarav-mehta'],
  ['mei-lin', 'ishaan-kulkarni'],
  ['kwame-mensah', 'priya-nair'],
  ['kwame-mensah', 'aarav-mehta'],
  ['sofia-rossi', 'diego-alvarez'],
  ['ishaan-kulkarni', 'aarav-mehta'],
  ['ishaan-kulkarni', 'mei-lin'],
  ['ishaan-kulkarni', 'hannah-becker'],
  ['ishaan-kulkarni', 'priya-nair'],
  ['hannah-becker', 'aarav-mehta'],
];

/**
 * Conversations: a top-level comment on someone's post (identified by author and post index),
 * optionally followed by replies.
 */
export const CONVERSATIONS: {
  post: [author: string, index: number];
  comment: [author: string, content: string];
  replies?: [author: string, content: string][];
}[] = [
  {
    post: ['aarav-mehta', 0],
    comment: ['ishaan-kulkarni', 'How did you find out which query was slow?'],
    replies: [
      [
        'aarav-mehta',
        'EXPLAIN (ANALYZE, BUFFERS). It showed a sequential scan on the child table.',
      ],
    ],
  },
  {
    post: ['hannah-becker', 0],
    comment: ['priya-nair', 'Where should the access token live instead?'],
    replies: [
      [
        'hannah-becker',
        'In memory. The refresh token goes in an HttpOnly cookie that scripts cannot read.',
      ],
      [
        'aarav-mehta',
        'That is exactly what we did. Page reloads call /auth/refresh to get a new access token.',
      ],
    ],
  },
  {
    post: ['ishaan-kulkarni', 1],
    comment: ['kwame-mensah', 'Yes, use the HTTP status. Clients and monitoring both rely on it.'],
  },
  {
    post: ['diego-alvarez', 0],
    comment: [
      'mei-lin',
      'Distroless helped us too. Debugging got harder though: no shell in the image.',
    ],
  },
];
