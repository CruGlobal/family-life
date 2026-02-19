# Cru App Lambda Template
This is a template for a basic Cru Application using the AWS Lambda service. It includes the necessary configuration to build
and deploy the application to AWS Lambda using the [aws/lambda/app](https://github.com/CruGlobal/cru-terraform-modules/blob/main/aws/lambda/app/README.md) Terraform module.

## Bootstrap new Cru App
You can bootstrap a new GitHub repository and Cru Application using the [Add Cru Application](https://github.com/CruGlobal/cru-terraform/actions/workflows/cru-application.yml) GitHub workflow.
Click the `Run workflow` button and follow the prompts. This will create a Terraform Pull Request that when applied,
will create a new GitHub Repository using this template. Subsequent application environments (`production` or `staging`)
can be created using the [Add Cru App Environment](https://github.com/CruGlobal/cru-terraform/actions/workflows/cru-application-env.yml) GitHub workflow.

## Usage
The template application uses TypeScript and esbuild to bundle the code into a single file. Update the project name and
description in `package.json` to match your application.

Builds and Deployments are managed by [build-deploy-lambda.yml](https://github.com/CruGlobal/cru-app-lambda-template/blob/main/.github/workflows/build-deploy-lambda.yml) GitHub workflow.
The Build process executes the `build.sh` file which is responsible for building a Docker container. After a successful
build, the Deployment process triggers a deployment of the Application in the [cru-deploy](https://github.com/CruGlobal/cru-deploy/actions/workflows/deploy-lambda.yml) GitHub repository.
The build and deployment process will fail until the Terraform for the application environment has been applied. You can
comment out specific [branches](https://github.com/CruGlobal/cru-app-lambda-template/blob/main/.github/workflows/build-deploy-lambda.yml#L6-L8) to reduce the build failure noise until specific environments are ready.
Terraform is responsible for creating the permissions which GitHub uses to access the AWS Lambda service.
