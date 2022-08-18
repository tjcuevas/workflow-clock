import { Octokit, App } from "octokit";
import fs from "fs";
import inquirer from 'inquirer';
import 'dotenv/config';
import { formatISO, sub } from 'date-fns';

const octokit = new Octokit({
  auth: process.env.GH_AUTH_TOKEN,
});

const getInteractiveSettings = async () => {
	let settings = {};
	const repos = await octokit.request('GET /user/repos', { per_page: 100 });

	const options = repos.data.map(r => r.name);
	const answers = await inquirer.prompt([{
		type: 'list',
		name: 'getRepo',
		message: 'Which repository do you want to search?',
		choices: options
	}]);
	
	const option = repos.data.find(r => r.name === answers.getRepo);
	settings.repository = option.name;
	settings.owner = option.owner.login;

	const workflows = await octokit.rest.actions.listRepoWorkflows({
		owner: settings.owner,
		repo: settings.repository
	});

	const workflowAnswer = await inquirer.prompt([{
		type: 'list',
		name: 'getWorkflow',
		message: 'Which workflow?',
		choices: workflows.data.workflows.map(w => w.name)
	},{
		type: 'input',
		name: 'getDate',
		message: 'How many days back would you like to go?'
	}]);

	settings.workflowId = workflows.data.workflows.find(w => w.name === workflowAnswer.getWorkflow).id;
	settings.startDate =  formatISO(sub(Date.now(), { days: +workflowAnswer.getDate}), { representation: 'date' });
	return settings;
};

const settings = await getInteractiveSettings();

const result = await octokit.paginate(
  "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
  {
    owner: settings.owner,
    repo: settings.repository,
    workflow_id: settings.workflowId,
    created: `>=${settings.startDate}`,
    status: "success",
  }
);

fs.writeFileSync("out.csv", "date,user time,billable time\n");
result.forEach(async (workflowRun) => {
  const timingResult = await octokit.request(
    "GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing",
    {
      owner: settings.owner,
      repo: settings.repository,
      run_id: workflowRun.id,
    }
  );

  fs.appendFileSync(
    "out.csv",
    `${workflowRun.created_at},${
      timingResult.data.run_duration_ms / 1000 / 60
    },${timingResult.data.billable.UBUNTU.total_ms / 1000 / 60}\n`
  );
});
