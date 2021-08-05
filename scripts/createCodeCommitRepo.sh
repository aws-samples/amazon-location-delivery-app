#!/bin/sh
aws codecommit create-repository \
--region us-west-2  \
--repository-name delivery-app \
--profile $1 &