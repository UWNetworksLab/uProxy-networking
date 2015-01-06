
# Dockerfile for a standard uproxy-networking test

FROM selenium/node-chrome
MAINTAINER Lalon <klazizpro@gmail.com>

USER root

RUN apt-get update -qqy \
  && apt-get -qqy install \
    nodejs nodejs-legacy git npm 

RUN npm install -g grunt-cli
ADD . /uproxy-networking
WORKDIR /uproxy-networking

RUN npm install

ENV DISPLAY :10

ENTRYPOINT ["/uproxy-networking/tools/docker-entrypoint.sh"]

