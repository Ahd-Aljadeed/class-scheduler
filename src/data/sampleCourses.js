export const INITIAL_COURSES = [
  {
    id: "course-calc2",
    code: "Calculus II",
    title: "Calculus II",
    color: "#6366f1", // Indigo
    sections: [
      {
        id: "sec-calc2-1",
        name: "Section 1",
        instructor: "Staff",
        location: "P-107 / P-103",
        times: [
          { day: "Mon", startTime: "12:00", endTime: "14:00" },
          { day: "Wed", startTime: "12:00", endTime: "14:00" }
        ]
      },
      {
        id: "sec-calc2-2",
        name: "Section 2",
        instructor: "Staff",
        location: "P-106",
        times: [
          { day: "Mon", startTime: "14:00", endTime: "16:00" },
          { day: "Wed", startTime: "14:00", endTime: "16:00" }
        ]
      },
      {
        id: "sec-calc2-3",
        name: "Section 3",
        instructor: "Staff",
        location: "P-105 / P-104",
        times: [
          { day: "Thu", startTime: "08:00", endTime: "10:00" },
          { day: "Tue", startTime: "16:00", endTime: "18:00" }
        ]
      },
      {
        id: "sec-calc2-4",
        name: "Section 4",
        instructor: "Staff",
        location: "P-103 / P-105",
        times: [
          { day: "Thu", startTime: "14:00", endTime: "16:00" },
          { day: "Tue", startTime: "14:00", endTime: "16:00" }
        ]
      }
    ]
  },
  {
    id: "course-debate",
    code: "Academic Debate",
    title: "Academic Debate",
    color: "#ec4899", // Pink
    sections: [
      {
        id: "sec-debate-1",
        name: "Section 1",
        instructor: "Staff",
        location: "M-G04 / M-G05",
        times: [
          { day: "Wed", startTime: "08:00", endTime: "09:30" },
          { day: "Thu", startTime: "09:30", endTime: "11:00" }
        ]
      },
      {
        id: "sec-debate-2",
        name: "Section 2",
        instructor: "Staff",
        location: "M-G02 / M-G08",
        times: [
          { day: "Wed", startTime: "09:30", endTime: "11:00" },
          { day: "Thu", startTime: "11:00", endTime: "12:30" }
        ]
      },
      {
        id: "sec-debate-3",
        name: "Section 3",
        instructor: "Staff",
        location: "P-108 / P-107",
        times: [
          { day: "Mon", startTime: "09:30", endTime: "11:00" },
          { day: "Wed", startTime: "09:30", endTime: "11:00" }
        ]
      },
      {
        id: "sec-debate-4",
        name: "Section 4",
        instructor: "Staff",
        location: "P-101 / P-106",
        times: [
          { day: "Mon", startTime: "11:00", endTime: "12:30" },
          { day: "Wed", startTime: "11:00", endTime: "12:30" }
        ]
      }
    ]
  },
  {
    id: "course-genchem",
    code: "Gen Chemistry & Lab",
    title: "General Chemistry & Lab",
    color: "#06b6d4", // Cyan
    sections: [
      {
        id: "sec-genchem-1",
        name: "Section 1",
        instructor: "Staff",
        location: "P-G04",
        times: [
          { day: "Thu", startTime: "14:00", endTime: "15:30" },
          { day: "Sun", startTime: "08:30", endTime: "10:00" }
        ]
      },
      {
        id: "sec-genchem-2",
        name: "Section 2",
        instructor: "Staff",
        location: "P-G04",
        times: [
          { day: "Wed", startTime: "10:00", endTime: "11:30" },
          { day: "Sun", startTime: "12:30", endTime: "14:00" }
        ]
      },
      {
        id: "sec-genchem-3",
        name: "Section 3",
        instructor: "Staff",
        location: "P-G04",
        times: [
          { day: "Wed", startTime: "12:00", endTime: "13:30" }
        ]
      }
    ]
  },
  {
    id: "course-chemlab",
    code: "Gen Chemistry Lab",
    title: "General Chemistry Lab",
    color: "#f59e0b", // Amber
    sections: [
      {
        id: "sec-chemlab-1",
        name: "Section 1",
        instructor: "Staff",
        location: "M-B10",
        times: [
          { day: "Sat", startTime: "08:00", endTime: "10:00" }
        ]
      },
      {
        id: "sec-chemlab-2",
        name: "Section 2",
        instructor: "Staff",
        location: "M-B10",
        times: [
          { day: "Sat", startTime: "10:00", endTime: "12:00" }
        ]
      },
      {
        id: "sec-chemlab-3",
        name: "Section 3",
        instructor: "Staff",
        location: "M-B10",
        times: [
          { day: "Sat", startTime: "12:00", endTime: "14:00" }
        ]
      },
      {
        id: "sec-chemlab-4",
        name: "Section 4",
        instructor: "Staff",
        location: "M-B10",
        times: [
          { day: "Sat", startTime: "14:00", endTime: "16:00" }
        ]
      },
      {
        id: "sec-chemlab-5",
        name: "Section 5",
        instructor: "Staff",
        location: "M-B10",
        times: [
          { day: "Sun", startTime: "14:00", endTime: "16:00" }
        ]
      }
    ]
  },
  {
    id: "course-geology",
    code: "Physical Geology",
    title: "Physical Geology",
    color: "#10b981", // Emerald
    sections: [
      {
        id: "sec-geology-1",
        name: "Section 1",
        instructor: "Staff",
        location: "P-106",
        times: [
          { day: "Mon", startTime: "12:30", endTime: "14:00" },
          { day: "Thu", startTime: "12:30", endTime: "14:00" }
        ]
      }
    ]
  },
  {
    id: "course-physics",
    code: "Gen Physics I & Lab",
    title: "General Physics I & Lab",
    color: "#8b5cf6", // Purple
    sections: [
      {
        id: "sec-physics-1",
        name: "Section 1",
        instructor: "Staff",
        location: "M-111",
        times: [
          { day: "Sat", startTime: "08:00", endTime: "11:00" }
        ]
      },
      {
        id: "sec-physics-2",
        name: "Section 2",
        instructor: "Staff",
        location: "E-G10",
        times: [
          { day: "Sat", startTime: "11:00", endTime: "14:00" }
        ]
      }
    ]
  },
  {
    id: "course-physlab",
    code: "Gen Physics I Lab",
    title: "General Physics I Lab",
    color: "#ef4444", // Red
    sections: [
      {
        id: "sec-physlab-1",
        name: "Section 1",
        instructor: "Staff",
        location: "L-G23",
        times: [
          { day: "Mon", startTime: "12:00", endTime: "14:00" }
        ]
      },
      {
        id: "sec-physlab-2",
        name: "Section 2",
        instructor: "Staff",
        location: "L-G23",
        times: [
          { day: "Mon", startTime: "15:00", endTime: "17:00" }
        ]
      },
      {
        id: "sec-physlab-3",
        name: "Section 3",
        instructor: "Staff",
        location: "L-G23",
        times: [
          { day: "Tue", startTime: "14:00", endTime: "16:00" }
        ]
      },
      {
        id: "sec-physlab-4",
        name: "Section 4",
        instructor: "Staff",
        location: "L-G23",
        times: [
          { day: "Thu", startTime: "14:00", endTime: "16:00" }
        ]
      }
    ]
  }
];

export const PALETTE_COLORS = [
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#f97316"  // Orange
];
