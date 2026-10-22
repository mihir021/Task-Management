export interface MonitorMapping {
  repositoryId: string;
  jobPath: string;
}

export interface MonitorConfig {
  jenkinsUrl: string;
  credentialsConfigured: boolean;
  mappings: MonitorMapping[];
}

export interface JenkinsBuild {
  number: number;
  result: string | null;
  building: boolean;
  timestamp: number;
  duration: number;
  url: string;
  displayName?: string;
  description?: string;
}

export interface MonitorJob {
  name: string;
  url: string;
  builds: JenkinsBuild[];
  checkedAt: string;
}

export interface MonitorLog {
  text: string;
  nextStart: number;
  moreData: boolean;
  truncated: boolean;
}
