import { CareerQuiz, EducationalContent, User } from "src/modules/schemas";

export interface DashboardData {
    educationalContents?: EducationalContent[];
    student?: User[];
    analytics?: any;
}

export interface DashboardResponse extends DashboardData {
    students?: User[],
    success: boolean,
    message: string,
    timestamp: string,
    userId: string,
    summary?: DashboardSummary,
    currentUser: User,
    quizStatus?: {
        hasQuiz: boolean;
        isCompleted: boolean;
        needsToTakeQuiz: boolean;
    },
    stars?: any[], // Adding stars field to the response
    // data?: {
    //     success: true,
    //     message: 'Dashboard data retrieved successfully',        
    // };
}

export interface SuperAdminDashboardResponse {

}

export interface DashboardSummary {
    totalStudent?: number;
    totalBadges?: number;
    totalSchools?: number;
    totalUsers?: number;
    totalShowcases?: number;
    completedQuizzes?: number;
    recentActivities?: number;
    // user: User[]
}