export interface Subject {
  id: string;
  code: string;
  name: string;
  documentCount: number;
}

export interface CreateSubjectPayload {
  code: string;
  name: string;
}
