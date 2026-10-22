# Jenkins Monitor

Open **Monitor** in the sidebar. Tasks with status **Monitor Logs & Process**
appear automatically. Select a task repository to inspect its configured Jenkins
job. You can also inspect a repository directly without moving a task.

The dashboard and dashboard worktree initially map to the supplied `raydashboard`
job. Set other repository job names under **Jenkins connection & repository jobs**.
Use `folder/job` for nested jobs. Blank job names disable that mapping. Mappings
persist in `MIHIR/data/monitor-config.json`, independently of task records.

Configure the server `.env` file:

```dotenv
JENKINS_URL=http://192.168.110.129:8080
JENKINS_USER=your-jenkins-user
JENKINS_API_TOKEN=your-jenkins-api-token
```

Restart `npm run dev` after changing environment variables. Credentials remain on
the server and are not sent to the browser or written into repository mappings.
Use an account with job/build/log read permissions. Jenkins authentication setup
is documented in its [Remote Access API guide](https://www.jenkins.io/doc/book/using/remote-access-api/).

The view shows the most recent 20 job builds. Select a build to pin its console or
choose **Follow latest build**. Live refresh polls history every 15 seconds and
active console output every 5 seconds while this view is open. Toggle it off to
pause; Refresh performs a fresh read. No builds, deployments or service commands
are triggered. Closing the view stops polling.

Console reads use incremental byte offsets and bounded responses. The display
retains the latest 200,000 characters, supports text search and an errors/warnings
filter, and can follow incoming output. Full console output remains in Jenkins.
Logs render as plain text, including any HTML in build output.

Build history is shared by a Jenkins job: it is not proof that a task's branch or
commit was deployed. Verify the selected build in Jenkins. Runtime service health
and separate service logs are not configured by this integration.

Monitor API reads and configuration are available only from loopback clients on
the local computer. Other workspace routes retain their existing behavior.
External-site origins and Jenkins redirects are rejected. The Jenkins server
address can only be changed through server environment configuration.

Endpoints:

- `GET /api/monitor/config`
- `PUT /api/monitor/config` with `{ "mappings": [{ "repositoryId": "...", "jobPath": "raydashboard" }] }`
- `GET /api/monitor/repositories/:id/builds`
- `GET /api/monitor/repositories/:id/builds/:number/log?start=0`

Run `npm run test:monitor`, `npm run lint`, and `npm run build` with Node 22.
