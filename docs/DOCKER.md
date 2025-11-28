# Setup docker mode

instructions to run this shit in containers

needs /var/run/docker.sock (sue me)

# installation

- install docker or docker.io pkg or w/e its called today
- cd docker
- copy bot to docker dir
- copy htdocs to www in docker dir
- execute `build.sh`
- execute `run.sh`

if the bot doesnt work due to nodejs issues, try rebuilding node_modules:

`ARGS="--build-arg ENV=dev" ./build.sh bot`

# k3s

..add k3s or some shit here..

meh, u'll figure it out amirite

