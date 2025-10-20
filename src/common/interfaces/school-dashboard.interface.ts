export interface SchoolStudentInfo {
    _id: string;
    fullName: string;
    email: string;
    addedBy: {
      name: string;
      role: string;
    };
  }
  
  export interface SchoolDashboardSummary {
    totalStudentsAdded: number;
    studentLimit: number;
    students: SchoolStudentInfo[];
  }
  
  export interface SchoolDashboardResponse {
    success: boolean;
    message: string;
    timestamp: string;
    userId: string;
    summary: SchoolDashboardSummary;
  }
  